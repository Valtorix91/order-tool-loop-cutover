import { automateOrder } from "./ecommerce_agent.js";

const result = await automateOrder({
  orderId: "order_1042",
  customerEmail: "builder@example.com",
  sku: "desk-lamp-black",
  quantity: 1,
  shippingAddress: "18 Market Street, Austin, TX 78701"
});

console.log(JSON.stringify(result, null, 2));
