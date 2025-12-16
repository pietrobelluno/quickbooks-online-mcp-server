import { createQuickbooksAccount } from "../handlers/create-quickbooks-account.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_account";
const toolDescription = "Create a chart‑of‑accounts entry in QuickBooks Online.";

const toolSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  sub_type: z.string().optional(),
  description: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksAccount(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating account: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Account created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreateAccountTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
  destructiveHint: true,
}; 