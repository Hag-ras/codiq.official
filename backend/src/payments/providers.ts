import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, User } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

interface ChargeInput {
  paymentId: string;
  amount: number; // piasters
  itemName: string;
  customer: Pick<User, 'id' | 'name' | 'email' | 'phone'>;
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Paymob Unified Checkout (Intention API): cards, mobile wallets (Vodafone Cash,
 * Orange, Etisalat, WE) and installment providers (valU, Souhoola, bank plans)
 * depending on which integration IDs are enabled on your Paymob account.
 * Verify field names against Paymob's current docs before going live.
 */
@Injectable()
export class PaymobProvider {
  private base = 'https://accept.paymob.com';
  private log = new Logger('Paymob');
  constructor(private config: ConfigService) {}

  private integrations(method: PaymentMethod): number[] {
    const key = {
      CARD: 'PAYMOB_CARD_INTEGRATION_ID',
      WALLET: 'PAYMOB_WALLET_INTEGRATION_ID',
      INSTALLMENTS: 'PAYMOB_INSTALLMENT_INTEGRATION_IDS',
    }[method as 'CARD' | 'WALLET' | 'INSTALLMENTS'];
    return this.config.getOrThrow<string>(key).split(',').map((s) => Number(s.trim())).filter(Boolean);
  }

  async createIntention(method: PaymentMethod, input: ChargeInput) {
    const [first, ...rest] = input.customer.name.trim().split(/\s+/);
    const phone = input.customer.phone ? `+2${input.customer.phone}` : '+201000000000';
    const res = await fetch(`${this.base}/v1/intention/`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.config.getOrThrow('PAYMOB_SECRET_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amount,
        currency: 'EGP',
        payment_methods: this.integrations(method),
        items: [{ name: input.itemName, amount: input.amount, quantity: 1 }],
        billing_data: { first_name: first, last_name: rest.join(' ') || first, email: input.customer.email, phone_number: phone, country: 'EG' },
        special_reference: input.paymentId,
        notification_url: `${this.config.get('API_PUBLIC_URL')}/api/payments/webhooks/paymob`,
        redirection_url: `${this.config.get('FRONTEND_URL')}/checkout/result?paymentId=${input.paymentId}`,
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.client_secret) {
      this.log.error(JSON.stringify(data));
      throw new BadGatewayException('Could not start the payment. Please try again.');
    }
    return {
      providerRef: String(data.id),
      redirectUrl: `${this.base}/unifiedcheckout/?publicKey=${this.config.getOrThrow('PAYMOB_PUBLIC_KEY')}&clientSecret=${data.client_secret}`,
    };
  }

  /** HMAC-SHA512 over the transaction fields in Paymob's documented order. */
  verify(obj: any, hmac?: string) {
    if (!hmac) return false;
    const fields = [
      obj.amount_cents, obj.created_at, obj.currency, obj.error_occured, obj.has_parent_transaction, obj.id,
      obj.integration_id, obj.is_3d_secure, obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
      obj.is_voided, obj.order?.id, obj.owner, obj.pending, obj.source_data?.pan, obj.source_data?.sub_type,
      obj.source_data?.type, obj.success,
    ];
    const calc = createHmac('sha512', this.config.getOrThrow('PAYMOB_HMAC_SECRET')).update(fields.map(String).join('')).digest('hex');
    return safeEqual(calc, hmac);
  }
}

/** FawryPay "Pay at Fawry": customer pays a reference code at any Fawry outlet or app. */
@Injectable()
export class FawryProvider {
  private log = new Logger('Fawry');
  constructor(private config: ConfigService) {}

  async createReference(input: ChargeInput) {
    const merchantCode = this.config.getOrThrow<string>('FAWRY_MERCHANT_CODE');
    const secureKey = this.config.getOrThrow<string>('FAWRY_SECURE_KEY');
    const amount = (input.amount / 100).toFixed(2);
    const method = 'PAYATFAWRY';
    const signature = createHash('sha256')
      .update(merchantCode + input.paymentId + input.customer.id + method + amount + secureKey)
      .digest('hex');
    const expiresAt = Date.now() + 48 * 3_600_000;
    const res = await fetch(`${this.config.get('FAWRY_BASE_URL')}/ECommerceWeb/Fawry/payments/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantCode,
        merchantRefNum: input.paymentId,
        customerProfileId: input.customer.id,
        customerName: input.customer.name,
        customerMobile: input.customer.phone ?? undefined,
        customerEmail: input.customer.email,
        paymentMethod: method,
        amount: Number(amount),
        currencyCode: 'EGP',
        description: input.itemName,
        paymentExpiry: expiresAt,
        chargeItems: [{ itemId: input.paymentId, description: input.itemName, price: Number(amount), quantity: 1 }],
        signature,
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data.statusCode !== 200 || !data.referenceNumber) {
      this.log.error(JSON.stringify(data));
      throw new BadGatewayException('Could not create a Fawry code. Please try again.');
    }
    return { providerRef: String(data.referenceNumber), expiresAt: new Date(expiresAt) };
  }

  /** Server notification V2 signature check. */
  verify(n: any) {
    const sig = createHash('sha256')
      .update(
        `${n.fawryRefNumber}${n.merchantRefNumber}${Number(n.paymentAmount).toFixed(2)}${Number(n.orderAmount).toFixed(2)}` +
          `${n.orderStatus}${n.paymentMethod}${n.paymentRefrenceNumber ?? ''}${this.config.getOrThrow('FAWRY_SECURE_KEY')}`,
      )
      .digest('hex');
    return typeof n.messageSignature === 'string' && safeEqual(sig, n.messageSignature);
  }
}
