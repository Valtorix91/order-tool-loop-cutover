import assert from "node:assert/strict";
import test from "node:test";
import { OrderWorkflow } from "../src/order_workflow.js";

const order = {
  orderId: "order_1042",
  customerEmail: "builder@example.com",
  sku: "desk-lamp-black",
  quantity: 1,
  shippingAddress: "18 Market Street, Austin, TX 78701"
};

test("an order cannot be fulfilled before checkout", () => {
  const workflow = new OrderWorkflow(order);
  assert.throws(
    () => workflow.execute("fulfill_order", JSON.stringify({ orderId: order.orderId, idempotencyKey: "order_1042:fulfill_order" })),
    /requires checked_out/
  );
});

test("the four business decisions finish with a customer update", () => {
  const workflow = new OrderWorkflow(order);
  for (const tool of ["checkout_order", "fulfill_order", "send_receipt", "update_customer"] as const) {
    workflow.execute(tool, JSON.stringify({ orderId: order.orderId, idempotencyKey: `${order.orderId}:${tool}` }));
  }
  assert.equal(workflow.state.stage, "customer_notified");
  assert.equal(workflow.state.receiptId, "receipt_order_1042");
  assert.match(workflow.state.customerMessage ?? "", /track_order_1042/);
});
