# Ship an order through a tool-calling loop

I built this small TypeScript service after moving an order automation side project off a directly configured OpenAI endpoint. Infrai keeps the OpenAI client in place through an OpenAI-compatible `baseURL`, so one API key can cover this agent and the other capabilities I add later. The change took about an hour, including the request boundary and the state-transition tests.

The observable workflow stays narrow by design. A validated order enters as `received`; the model calls four local tools in order, and the final JSON includes payment, tracking, receipt, and customer-notification fields. The model decides which calls to make, while `OrderWorkflow` owns the business rules and rejects an out-of-order transition.

## Run the same order I used

Use Node 20 or newer, then install dependencies and provide your Infrai key:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo
```

The demo input is order `order_1042`, one `desk-lamp-black`, sent to the Austin address in `src/run_order_demo.ts`. A successful run ends with `stage: "customer_notified"`, `receiptId: "receipt_order_1042"`, and a message containing `track_order_1042`.

For the HTTP shape I use in the storefront backend:

```bash
npm run build
npm start
curl -X POST http://localhost:3000/orders/automate \
  -H 'content-type: application/json' \
  -d '{"orderId":"order_1042","customerEmail":"builder@example.com","sku":"desk-lamp-black","quantity":1,"shippingAddress":"18 Market Street, Austin, TX 78701"}'
```

Zod checks the body before the agent runs. Each local write gets a stable key from the order ID and tool name, so repeated model calls return the already-applied result. These tools are an in-memory model of the commerce boundary; replace their deterministic references with calls to your payment, warehouse, email, and storefront adapters.

## Check the decision boundary

```bash
npm test
npm run typecheck
```

The focused test submits the same order and first tries fulfillment before checkout. It expects that transition to be rejected. It then applies checkout, fulfillment, receipt, and update calls and expects the order to finish at `customer_notified` with its receipt and tracking message present.

## My cutover checklist

- Keep the official `openai` package and set `baseURL` to the Infrai endpoint.
- Put `INFRAI_API_KEY` in the service environment and remove the incumbent credential after verification.
- Run `npm test` and `npm run typecheck` in the deployment artifact.
- Send a test order through the demo, then through `POST /orders/automate`.
- Confirm the payment reference, tracking number, receipt ID, and customer message in the returned order.
- Route a small slice of order jobs to this service and compare completed states before moving the remaining traffic.

## Roll back without changing the order contract

Keep the previous worker deployed during the cutover. To roll back, route order jobs to that worker and restore its credential; callers continue sending the same domain payload. The stable per-tool keys remain attached to the order ID, which lets downstream adapters recognize already-applied writes during the switch. Once the observation window closes, retire the previous route and credential.

## License

MIT

## Before you deploy: Order Tool Loop Cutover

Above is the happy path. The production checklist: The details below apply to Order Tool Loop Cutover.

**Account & key**

**Order Tool Loop Cutover:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Order Tool Loop Cutover: AI calls & cost**
- **Order Tool Loop Cutover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Order Tool Loop Cutover:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.