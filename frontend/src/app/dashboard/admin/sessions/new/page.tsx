'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { api, uploadFile } from '@/lib/api';
import { fmtSize } from '@/lib/format';
import { Button, Card, Field, Input, PageTitle, Select, Textarea, cx } from '@/components/ui';
import type { Package } from '@/lib/types';

type Material = { name: string; fileKey: string; sizeBytes: number; mimeType: string };
type Values = {
  packageId: string; title: string; description: string; type: 'LIVE' | 'RECORDED';
  startsAt: string; durationMin: number; instructorId: string;
  assignmentTitle: string; assignmentBrief: string; assignmentDue: string; maxScore: number;
  questions: { text: string; options: { value: string }[]; correctIndex: number }[];
};
const blankQ = () => ({ text: '', options: [{ value: '' }, { value: '' }, { value: '' }, { value: '' }], correctIndex: 0 });

export default function NewSessionPage() {
  const router = useRouter();
  const { data: packages } = useQuery({ queryKey: ['packages', 'all'], queryFn: () => api<Package[]>('/packages?all=1') });
  const { data: instructors } = useQuery({ queryKey: ['users', 'INSTRUCTOR'], queryFn: () => api<{ id: string; name: string }[]>('/users?role=INSTRUCTOR') });
  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    defaultValues: { type: 'LIVE', durationMin: 60, maxScore: 10, questions: [blankQ()] },
  });
  const qs = useFieldArray({ control, name: 'questions' });
  const [materials, setMaterials] = useState<Material[]>([]);
  const [video, setVideo] = useState<Material | null>(null);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const type = watch('type');

  const upload = async (files: FileList | null, purpose: 'material' | 'recording') => {
    if (!files?.length) return;
    setUploading(purpose);
    try {
      for (const f of Array.from(files)) {
        const r = await uploadFile(f, purpose);
        const m = { name: r.name, fileKey: r.key, sizeBytes: r.size, mimeType: r.type };
        purpose === 'material' ? setMaterials((x) => [...x, m]) : setVideo(m);
      }
    } catch (e) { setError((e as Error).message); } finally { setUploading(''); }
  };

  const onSubmit = handleSubmit(async (v) => {
    setError('');
    const questions = v.questions
      .filter((q) => q.text.trim())
      .map((q) => ({ text: q.text, options: q.options.map((o) => o.value).filter(Boolean), correctIndex: Number(q.correctIndex) }));
    try {
      await api('/sessions', {
        method: 'POST',
        json: {
          packageId: v.packageId, title: v.title, description: v.description || undefined, type: v.type,
          startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : undefined, durationMin: Number(v.durationMin),
          instructorId: v.instructorId || undefined, videoKey: video?.fileKey, materials,
          assignment: v.assignmentTitle ? { title: v.assignmentTitle, brief: v.assignmentBrief, dueAt: v.assignmentDue ? new Date(v.assignmentDue).toISOString() : undefined, maxScore: Number(v.maxScore) } : undefined,
          quiz: questions.length ? { questions } : undefined,
        },
      });
      router.push('/dashboard/admin/sessions');
    } catch (e) { setError((e as Error).message); }
  });

  return (
    <>
      <PageTitle title="New session" />
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Package" error={errors.packageId && 'Choose a package'}>
            <Select {...register('packageId', { required: true })} defaultValue="">
              <option value="" disabled>Choose…</option>
              {packages?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Title" error={errors.title && 'Add a title'}><Input {...register('title', { required: true, minLength: 2 })} /></Field>
          <div className="sm:col-span-2"><Field label="Description"><Textarea rows={2} {...register('description')} /></Field></div>
          <Field label="Type">
            <div className="grid grid-cols-2 gap-2">
              {(['LIVE', 'RECORDED'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setValue('type', t)}
                  className={cx('min-h-11 rounded-[10px] border text-[15px] font-semibold', type === t ? 'border-ink bg-ink text-paper' : 'border-line bg-white')}>
                  {t === 'LIVE' ? 'Live class' : 'Recorded'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Instructor">
            <Select {...register('instructorId')}><option value="">Unassigned</option>{instructors?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>
          </Field>
          <Field label={type === 'LIVE' ? 'Starts at' : 'Publish date (optional)'} error={errors.startsAt && 'Live classes need a start time'}>
            <Input type="datetime-local" {...register('startsAt', { required: type === 'LIVE' })} />
          </Field>
          <Field label="Duration (minutes)"><Input type="number" min={5} {...register('durationMin')} /></Field>
          {type === 'RECORDED' && (
            <div className="sm:col-span-2">
              <Field label="Video" hint="MP4 recommended. Live classes are recorded automatically when the instructor starts recording.">
                <Input type="file" accept="video/*" onChange={(e) => upload(e.target.files, 'recording')} />
              </Field>
              {uploading === 'recording' && <p className="mt-1 text-sm text-muted">Uploading video…</p>}
              {video && <p className="mt-1 text-sm">✓ {video.name} · {fmtSize(video.sizeBytes)}</p>}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Materials</h2>
          <Input type="file" multiple onChange={(e) => upload(e.target.files, 'material')} />
          {uploading === 'material' && <p className="text-sm text-muted">Uploading…</p>}
          {materials.map((m, i) => (
            <div key={m.fileKey} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-[15px]">
              <span>{m.name} <span className="text-muted">· {fmtSize(m.sizeBytes)}</span></span>
              <button type="button" className="text-sm font-semibold text-danger" onClick={() => setMaterials(materials.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
        </Card>

        <Card className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Assignment</h2>
          <Field label="Title"><Input {...register('assignmentTitle')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due"><Input type="datetime-local" {...register('assignmentDue')} /></Field>
            <Field label="Points"><Input type="number" min={1} {...register('maxScore')} /></Field>
          </div>
          <div className="sm:col-span-2"><Field label="Instructions"><Textarea {...register('assignmentBrief')} /></Field></div>
        </Card>

        <Card className="flex flex-col gap-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Quiz</h2><Button type="button" variant="secondary" onClick={() => qs.append(blankQ())}>Add question</Button></div>
          {qs.fields.map((f, qi) => {
            const correct = Number(watch(`questions.${qi}.correctIndex`));
            return (
              <div key={f.id} className="flex flex-col gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted">{qi + 1}.</span>
                  <Input placeholder="Question" {...register(`questions.${qi}.text`)} />
                  {qs.fields.length > 1 && <button type="button" onClick={() => qs.remove(qi)} className="text-sm font-semibold text-danger">Remove</button>}
                </div>
                <div className="grid gap-2 pl-6 sm:grid-cols-2">
                  {f.options.map((_, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <button type="button" aria-label="Mark as correct" onClick={() => setValue(`questions.${qi}.correctIndex`, oi)}
                        className={cx('grid size-8 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold', correct === oi ? 'border-[#3d7a5a] bg-[#3d7a5a] text-white' : 'border-line text-muted')}>
                        {'ABCD'[oi]}
                      </button>
                      <Input placeholder={`Option ${'ABCD'[oi]}`} {...register(`questions.${qi}.options.${oi}.value`)} />
                    </div>
                  ))}
                </div>
                <p className="pl-6 text-sm text-muted">Tap a letter to mark the correct answer.</p>
              </div>
            );
          })}
        </Card>

        {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting || !!uploading}>{isSubmitting ? 'Saving…' : 'Create session'}</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </>
  );
}
