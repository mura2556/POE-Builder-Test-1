import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolResponse } from './responses.js';

export type Handler<InputSchema extends z.ZodTypeAny, Output> = (
  input: z.infer<InputSchema>,
  context: any
) => Promise<ToolResponse<Output>>;

export interface ToolDefinition<InputSchema extends z.ZodTypeAny = z.ZodTypeAny, Output = unknown> {
  name: string;
  description: string;
  schema: InputSchema;
  handler: Handler<InputSchema, Output>;
}

export function makeTool<InputSchema extends z.ZodTypeAny, Output>(
  name: string,
  description: string,
  schema: InputSchema,
  handler: Handler<InputSchema, Output>
): ToolDefinition<InputSchema, Output> {
  return { name, description, schema, handler };
}

export function registerTool(server: McpServer, tool: ToolDefinition): void {
  const zodObject = tool.schema as unknown as z.ZodObject<any>;
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: zodObject.shape
    },
    async (args, extra) => {
      const input = tool.schema.parse(args ?? {});
      const response = await tool.handler(input, extra ?? {});
      return {
        content: [
          {
            type: 'application/json',
            data: response
          }
        ]
      };
    }
  );
}
