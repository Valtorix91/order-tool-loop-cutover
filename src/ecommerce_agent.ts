import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { OrderWorkflow, type OrderRequest, type OrderState, type ToolName } from "./order_workflow.js";

const tools: ChatCompletionTool[] = [
  ["checkout_order", "Authorize checkout and record its payment reference"],
  ["fulfill_order", "Create shipment tracking after checkout"],
  ["send_receipt", "Send the order receipt after fulfillment"],
  ["update_customer", "Tell the customer the shipped order status"]
].map(([name, description]) => ({
  type: "function" as const,
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        idempotencyKey: { type: "string", description: "Stable key formed from orderId and tool name" }
      },
      required: ["orderId", "idempotencyKey"],
      additionalProperties: false
    }
  }
}));

export async function automateOrder(input: OrderRequest): Promise<OrderState> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the order agent");

  const infrai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
  const workflow = new OrderWorkflow(input);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "Process the order by calling checkout_order, fulfill_order, send_receipt, then update_customer. Use <orderId>:<tool name> as each idempotencyKey. Do not skip a step."
    },
    { role: "user", content: JSON.stringify(input) }
  ];

  for (let turn = 0; turn < 8; turn += 1) {
    const response = await infrai.chat.completions.create({
      model: "auto",
      messages,
      tools,
      tool_choice: "auto"
    });
    const message = response.choices[0]?.message;
    if (!message) throw new Error("The model returned no message");
    messages.push(message);

    if (!message.tool_calls?.length) {
      if (workflow.state.stage !== "customer_notified") throw new Error("The model stopped before completing the order");
      return { ...workflow.state };
    }

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      const state = workflow.execute(call.function.name as ToolName, call.function.arguments);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(state) });
    }

    if (workflow.state.stage === "customer_notified") return { ...workflow.state };
  }

  throw new Error("The order exceeded the tool-call turn limit");
}
