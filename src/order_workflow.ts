import { z } from "zod";

export const orderRequestSchema = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  shippingAddress: z.string().min(8)
});

export type OrderRequest = z.infer<typeof orderRequestSchema>;
export type OrderStage = "received" | "checked_out" | "fulfilled" | "receipt_sent" | "customer_notified";

export interface OrderState extends OrderRequest {
  stage: OrderStage;
  paymentReference?: string;
  trackingNumber?: string;
  receiptId?: string;
  customerMessage?: string;
}

export type ToolName = "checkout_order" | "fulfill_order" | "send_receipt" | "update_customer";

const argumentsSchema = z.object({
  orderId: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

export class OrderWorkflow {
  readonly state: OrderState;
  private readonly applied = new Map<string, OrderState>();

  constructor(input: OrderRequest) {
    this.state = { ...input, stage: "received" };
  }

  execute(name: ToolName, rawArguments: string): OrderState {
    const args = argumentsSchema.parse(JSON.parse(rawArguments));
    if (args.orderId !== this.state.orderId) throw new Error("Tool orderId does not match the active order");
    const cached = this.applied.get(args.idempotencyKey);
    if (cached) return { ...cached };

    switch (name) {
      case "checkout_order":
        this.requireStage("received", name);
        this.state.paymentReference = `pay_${this.state.orderId}`;
        this.state.stage = "checked_out";
        break;
      case "fulfill_order":
        this.requireStage("checked_out", name);
        this.state.trackingNumber = `track_${this.state.orderId}`;
        this.state.stage = "fulfilled";
        break;
      case "send_receipt":
        this.requireStage("fulfilled", name);
        this.state.receiptId = `receipt_${this.state.orderId}`;
        this.state.stage = "receipt_sent";
        break;
      case "update_customer":
        this.requireStage("receipt_sent", name);
        this.state.customerMessage = `Order ${this.state.orderId} shipped as ${this.state.trackingNumber}`;
        this.state.stage = "customer_notified";
        break;
    }

    this.applied.set(args.idempotencyKey, { ...this.state });
    return { ...this.state };
  }

  private requireStage(expected: OrderStage, tool: ToolName): void {
    if (this.state.stage !== expected) {
      throw new Error(`${tool} requires ${expected}; order is ${this.state.stage}`);
    }
  }
}
