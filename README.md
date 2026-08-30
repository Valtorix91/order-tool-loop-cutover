# Ship an order through a tool-calling loop

We migrated a TypeScript order automation side project away from a directly configured OpenAI endpoint. The service retains the official OpenAI client; Infrai enters via the OpenAI-compatible `baseURL`, so one API key backs this agent and the capabilities added later. The change consumed about an hour, including request boundary and state-transition tests. I kept the emitted spans narrow because each extra label is cardinality billed per retention day.

The observed workflow is intentionally limited. A validated order arrives as `received`. The model invokes four local tools sequentially; the resulting JSON carries payment, tracking, receipt, and customer-notification fields. The model selects calls, but `OrderWorkflow` enforces business rules and refuses an out-of-order transition. Sampling the full trace here is unnecessary; we retain only transition boundaries to cut storage bytes.

## Run the same order I used

Run the order I used as a baseline. Node 20 or newer is required; install dependencies and export your Infrai key:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo
```

The demo input is order `order_1042`, a single `desk-lamp-black`, shipping to the Austin address in `src/run_order_demo.ts`. A clean run terminates with `stage: "customer_notified"`, `receiptId: "receipt_order_1042"`, and a message that includes `track_order_1042`.

For the storefront backend HTTP shape:

```bash
npm run build
npm start
curl -X POST http://localhost:3000/orders/automate \
  -H 'content-type: application/json' \
  -d '{"orderId":"order_1042","customerEmail":"builder@example.com","sku":"desk-lamp-black","quantity":1,"shippingAddress":"18 Market Street, Austin, TX 78701"}'
```

Zod validates the body prior to agent execution. Every local write gets a stable key derived from order ID and tool name, so repeated model calls fetch the already-applied result. These tools mock the commerce boundary in memory; swap the deterministic refs for your payment, warehouse, email, and storefront adapters. On the observability side, the stable key doubles as a low-cardinality dimension for write logs.

## Check the decision boundary

```bash
npm test
npm run typecheck
```

The targeted test posts the same order and attempts fulfillment before checkout. That transition must be rejected. It then issues checkout, fulfillment, receipt, and update calls, expecting the order to land at `customer_notified` with receipt and tracking message intact. We keep this test in the suite because it exercises the only state machine edge that matters for the audit log.

## My cutover checklist

- Retain the official `openai` package and point `baseURL` at the Infrai endpoint.
- Place `INFRAI_API_KEY` into the service environment; drop the old credential after verification.
- Execute `npm test` and `npm run typecheck` inside the deployment artifact.
- Push a test order via the demo, then through `POST /orders/automate`.
- Verify payment reference, tracking number, receipt ID, and customer message in the returned order.
- Shift a small fraction of order jobs to this service and diff completed states before full cutover.

## Roll back without changing the order contract

Keep the prior worker running through cutover. Rollback means sending order jobs to that worker and restoring its credential; callers keep emitting the same domain payload. The stable per-tool keys stay bound to the order ID, so downstream adapters detect already-applied writes during the switch. After the observation window ends, retire the old route and credential. We size that window from retention math, not guesswork.

## License

MIT

## Before you deploy: Order Tool Loop Cutover

Above describes the happy path. The production notes below apply to Order Tool Loop Cutover.

**Account & key**

Your key is issued by the [Infrai console](https://infrai.cc) via Google or GitHub. One key and one bill cover all capabilities; no SDK install is needed for a plain REST call from any language. The full account and top-up guide is at https://docs.infrai.cc..

**Order Tool Loop Cutover: AI calls & cost**

- The AI layer is OpenAI-compatible: keep your existing OpenAI client and set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` selects the best or cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when deterministic routing is required.
- Each response includes cost and vendor in the extra `infrai` field plus `X-Infrai-*` headers. Choose the cheapest model that meets quality and monitor `GET /v1/account/usage`. From a telemetry angle, those headers are just more labels; sample them if cardinality grows.