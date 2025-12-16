import { updateQuickbooksJournalEntry } from "../handlers/update-quickbooks-journal-entry.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "update_journal_entry";
const toolDescription = "Update a journal entry in QuickBooks Online.";

// Define the expected input schema for updating a journal entry
const toolSchema = z.object({
  journalEntry: z.any(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  const response = await updateQuickbooksJournalEntry(args.params.journalEntry);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error updating journal entry: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Journal entry updated:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdateJournalEntryTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
  destructiveHint: true,
}; 