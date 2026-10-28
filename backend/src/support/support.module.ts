import { Controller, Get, Headers, Injectable, Logger, Module, NotFoundException, OnModuleDestroy, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Role, SupportStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { avatarSrc } from '../common/avatar';

const MAX_BODY = 2000;
const STAFF_ROOM = 'staff';
/** Admins and assistants answer the chat. */
const isStaff = (r: Role) => r === Role.ADMIN || r === Role.ASSISTANT;
const userSelect = { id: true, name: true, email: true, phone: true, role: true, avatarKey: true, avatarUrl: true } as const;
const shapeUser = ({ avatarKey, avatarUrl, ...u }: { id: string; name: string; email: string; phone: string | null; role: Role; avatarKey: string | null; avatarUrl: string | null }) => ({ ...u, avatar: avatarSrc({ id: u.id, avatarKey, avatarUrl }) });

type ChatUser = { id: string; role: Role; name: string };
type Ack = (r: { ok: boolean; error?: string; guestKey?: string }) => void;
const GUEST_STARTS_PER_HOUR = 3;
const GUEST_MAX_MESSAGES = 300;
const ownerRoom = (t: { id: string; userId: string | null }) => (t.userId ? `user:${t.userId}` : `guest:${t.id}`);

/**
 * Live support chat. Everything here is plain socket.io, wired by hand in afterInit, so Nest's global HTTP
 * guards never run on it. Instead:
 *  - signed-in people authenticate with the access_token cookie (same JWT as the REST API); visitors who are not
 *    logged in can only open ONE conversation (rate limited per IP) and get a secret key to continue it,
 *  - staff actions (reply, read, resolve) re-read the role from the database on every event,
 *  - a minute timer drops sockets whose user was deleted or whose role changed.
 */
@Injectable()
@WebSocketGateway()
export class SupportGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private log = new Logger('SupportChat');
  private timer?: NodeJS.Timeout;
  private guestStarts = new Map<string, number[]>();
  constructor(private prisma: PrismaService, private jwt: JwtService, private config: ConfigService) {}

  onModuleDestroy() { clearInterval(this.timer); }

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const token = /(?:^|;\s*)access_token=([^;]+)/.exec(socket.handshake.headers.cookie ?? '')?.[1];
        const guestKey = typeof socket.handshake.auth?.guestKey === 'string' ? socket.handshake.auth.guestKey : null;
        if (token) {
          try {
            const { sub } = await this.jwt.verifyAsync<{ sub: string }>(decodeURIComponent(token), { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
            const u = await this.prisma.user.findUnique({ where: { id: sub }, select: { id: true, role: true, name: true } });
            if (!u) return next(new Error('unauthorized'));
            socket.data.user = u satisfies ChatUser;
            return next();
          } catch {
            if (!guestKey) return next(new Error('unauthorized'));
          }
        }
        if (guestKey) {
          const t = await this.prisma.supportThread.findUnique({ where: { guestKey }, select: { id: true } });
          if (t) socket.data.guest = { threadId: t.id };
        }
        next(); // not logged in: may only start a visitor conversation
      } catch {
        next(new Error('unauthorized'));
      }
    });

    server.on('connection', (socket) => {
      const me = socket.data.user as ChatUser | undefined;
      const stamps: number[] = [];
      const allowed = () => { const now = Date.now(); while (stamps.length && now - stamps[0] > 60_000) stamps.shift(); stamps.push(now); return stamps.length <= 30; };
      if (me) void socket.join(isStaff(me.role) ? STAFF_ROOM : `user:${me.id}`);
      else if (socket.data.guest) void socket.join(`guest:${socket.data.guest.threadId}`);
      const ip = String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address).split(',')[0].trim();

      const on = (event: string, fn: (data: any) => Promise<Partial<Parameters<Ack>[0]> | void>) =>
        socket.on(event, async (data: unknown, ack?: Ack) => {
          const done: Ack = typeof ack === 'function' ? ack : () => undefined;
          if (!allowed()) return done({ ok: false, error: 'You are sending too fast. Wait a moment.' });
          try { done({ ok: true, ...((await fn(data ?? {})) ?? {}) }); }
          catch (e) { done({ ok: false, error: e instanceof ChatError ? e.message : 'Something went wrong' }); if (!(e instanceof ChatError)) this.log.error((e as Error).stack); }
        });

      /** A visitor who is not logged in starts a conversation. Returns the secret key their browser keeps. */
      on('chat:start', async (d: { name?: string; contact?: string; body?: string }) => {
        if (me || socket.data.guest) throw new ChatError('You already have a conversation');
        const name = typeof d.name === 'string' ? d.name.trim() : '';
        if (name.length < 2 || name.length > 60) throw new ChatError('Enter your name (2 to 60 characters)');
        const contact = typeof d.contact === 'string' ? d.contact.trim().slice(0, 100) : '';
        const body = this.cleanBody(d.body);
        const now = Date.now();
        const recent = (this.guestStarts.get(ip) ?? []).filter((t) => now - t < 3_600_000);
        if (recent.length >= GUEST_STARTS_PER_HOUR) throw new ChatError('Too many new chats from your connection. Please try again later, or log in.');
        this.guestStarts.set(ip, [...recent, now]);
        const guestKey = randomBytes(24).toString('hex');
        const thread = await this.prisma.supportThread.create({ data: { guestKey, guestName: name, guestContact: contact || null } });
        socket.data.guest = { threadId: thread.id };
        await socket.join(`guest:${thread.id}`);
        await this.post(thread.id, thread.id, false, body);
        return { guestKey };
      });
      on('chat:send', async (d: { body?: string }) => {
        if (me && isStaff(me.role)) throw new ChatError('Staff reply to a conversation instead');
        const body = this.cleanBody(d.body);
        if (me) {
          const thread = (await this.prisma.supportThread.findFirst({ where: { userId: me.id, status: 'OPEN' } })) ?? (await this.prisma.supportThread.create({ data: { userId: me.id } }));
          return void (await this.post(thread.id, me.id, false, body));
        }
        const gid = socket.data.guest?.threadId as string | undefined;
        if (!gid) throw new ChatError('Start the conversation first');
        if ((await this.prisma.supportChatMessage.count({ where: { threadId: gid } })) >= GUEST_MAX_MESSAGES) throw new ChatError('This chat is full. Please log in or contact us another way.');
        await this.prisma.supportThread.update({ where: { id: gid }, data: { status: 'OPEN' } });
        await this.post(gid, gid, false, body);
      });
      on('chat:reply', async (d: { threadId?: string; body?: string }) => {
        if (!me) throw new ChatError('Not allowed');
        await this.assertStaff(me.id);
        const thread = await this.prisma.supportThread.findUnique({ where: { id: String(d.threadId) } });
        if (!thread) throw new ChatError('Conversation not found');
        const body = this.cleanBody(d.body);
        if (thread.status === 'RESOLVED') await this.prisma.supportThread.update({ where: { id: thread.id }, data: { status: 'OPEN' } });
        await this.post(thread.id, me.id, true, body);
      });
      on('chat:read', async (d: { threadId?: string }) => {
        if (me && isStaff(me.role)) {
          await this.assertStaff(me.id);
          await this.prisma.supportThread.update({ where: { id: String(d.threadId) }, data: { unreadForStaff: 0 } });
          await this.pushThread(String(d.threadId));
          return;
        }
        const t = me
          ? await this.prisma.supportThread.findFirst({ where: { userId: me.id }, orderBy: { lastMessageAt: 'desc' } })
          : socket.data.guest ? await this.prisma.supportThread.findUnique({ where: { id: socket.data.guest.threadId } }) : null;
        if (t && t.unreadForUser) { await this.prisma.supportThread.update({ where: { id: t.id }, data: { unreadForUser: 0 } }); await this.pushThread(t.id); }
      });
      on('chat:resolve', async (d: { threadId?: string; resolved?: boolean }) => {
        if (!me) throw new ChatError('Not allowed');
        await this.assertStaff(me.id);
        const status: SupportStatus = d.resolved === false ? 'OPEN' : 'RESOLVED';
        await this.prisma.supportThread.update({ where: { id: String(d.threadId) }, data: { status } });
        await this.pushThread(String(d.threadId));
      });
      on('chat:typing', async (d: { threadId?: string }) => {
        if (me && isStaff(me.role)) {
          const t = await this.prisma.supportThread.findUnique({ where: { id: String(d.threadId) }, select: { id: true, userId: true } });
          if (t) this.server.to(ownerRoom(t)).emit('chat:typing', { staff: true });
        } else if (me) this.server.to(STAFF_ROOM).emit('chat:typing', { userId: me.id });
        else if (socket.data.guest) this.server.to(STAFF_ROOM).emit('chat:typing', { userId: `g_${socket.data.guest.threadId}` });
      });
    });

    // Drop sockets whose account is gone or whose role changed since they connected
    this.timer = setInterval(async () => {
      try {
        const sockets = await this.server.fetchSockets();
        const ids = [...new Set(sockets.filter((s) => s.data.user).map((s) => (s.data.user as ChatUser).id))];
        const rows = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } })).map((r) => [r.id, r.role]));
        for (const s of sockets) { const u = s.data.user as ChatUser | undefined; if (u && rows.get(u.id) !== u.role) s.disconnect(true); }
      } catch (e) { this.log.error(`Role re-check failed: ${(e as Error).message}`); }
    }, 60_000);
    this.timer.unref();
  }

  private cleanBody(raw: unknown) {
    const body = typeof raw === 'string' ? raw.trim() : '';
    if (!body) throw new ChatError('Write a message first');
    if (body.length > MAX_BODY) throw new ChatError(`Messages can be up to ${MAX_BODY} characters`);
    return body;
  }

  private async assertStaff(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!u || !isStaff(u.role)) throw new ChatError('Not allowed');
  }

  private async post(threadId: string, senderId: string, fromStaff: boolean, body: string) {
    const [message, thread] = await this.prisma.$transaction([
      this.prisma.supportChatMessage.create({ data: { threadId, senderId, fromStaff, body } }),
      this.prisma.supportThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date(), ...(fromStaff ? { unreadForUser: { increment: 1 } } : { unreadForStaff: { increment: 1 } }) },
        select: { id: true, userId: true },
      }),
    ]);
    this.server.to(ownerRoom(thread)).to(STAFF_ROOM).emit('chat:message', { threadId, message });
    await this.pushThread(threadId);
  }

  /** Sends the thread's latest summary to the staff inbox and to the thread's owner. */
  private async pushThread(threadId: string) {
    const t = await this.prisma.supportThread.findUnique({ where: { id: threadId }, include: { user: { select: userSelect }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!t) return;
    this.server.to(ownerRoom(t)).to(STAFF_ROOM).emit('chat:thread', summarize(t));
  }
}

class ChatError extends Error {}

const summarize = (t: { id: string; status: SupportStatus; lastMessageAt: Date; unreadForStaff: number; unreadForUser: number; userId: string | null; guestName: string | null; guestContact: string | null; user: Parameters<typeof shapeUser>[0] | null; messages: { body: string; fromStaff: boolean }[] }) => ({
  id: t.id, status: t.status, lastMessageAt: t.lastMessageAt, unreadForStaff: t.unreadForStaff, unreadForUser: t.unreadForUser,
  user: t.user ? shapeUser(t.user) : { id: `g_${t.id}`, name: t.guestName ?? 'Visitor', email: t.guestContact ?? '', phone: null, role: 'visitor', avatar: null },
  last: t.messages[0] ? { body: t.messages[0].body.slice(0, 120), fromStaff: t.messages[0].fromStaff } : null,
});

/** History for the signed-in user's own conversation (the live part goes over the socket). */
@Controller('support')
class SupportController {
  constructor(private prisma: PrismaService) {}

  @Get('chat')
  async mine(@CurrentUser() u: AuthUser) {
    const thread = await this.prisma.supportThread.findFirst({ where: { userId: u.id }, orderBy: { lastMessageAt: 'desc' } });
    if (!thread) return { thread: null, messages: [] };
    const messages = await this.prisma.supportChatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'asc' }, take: 300 });
    return { thread: { id: thread.id, status: thread.status, unreadForUser: thread.unreadForUser }, messages };
  }
}

/** The staff inbox. Lives outside /admin so assistants can use it too. */
@Controller('support')
class GuestChatController {
  constructor(private prisma: PrismaService) {}

  /** A visitor reloading the page: the key from their browser identifies their conversation. */
  @Public()
  @Get('guest-chat')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async history(@Headers('x-guest-key') key?: string) {
    const thread = key ? await this.prisma.supportThread.findUnique({ where: { guestKey: key } }) : null;
    if (!thread) return { thread: null, messages: [] };
    const messages = await this.prisma.supportChatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'asc' }, take: GUEST_MAX_MESSAGES });
    return { thread: { id: thread.id, status: thread.status, unreadForUser: thread.unreadForUser }, messages };
  }
}

@Roles(Role.ADMIN, Role.ASSISTANT)
@Controller('support/inbox')
class SupportInboxController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list() {
    const rows = await this.prisma.supportThread.findMany({
      orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }], take: 300,
      include: { user: { select: userSelect }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return rows.map(summarize);
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const t = await this.prisma.supportThread.findUnique({ where: { id }, include: { user: { select: userSelect }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!t) throw new NotFoundException('Conversation not found');
    const messages = await this.prisma.supportChatMessage.findMany({ where: { threadId: id }, orderBy: { createdAt: 'asc' }, take: 500 });
    return { thread: summarize(t), messages };
  }
}

@Module({ imports: [JwtModule.register({})], controllers: [SupportController, GuestChatController, SupportInboxController], providers: [SupportGateway] })
export class SupportModule {}
