import { z } from 'zod'

import { allTools } from './index.ts'

// ---------------------------------------------------------------------------
// Zod introspection helpers
// ---------------------------------------------------------------------------

function zodTypeName(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodOptional) return zodTypeName(schema.unwrap())
  if (schema instanceof z.ZodNullable) return zodTypeName(schema.unwrap())
  if (schema instanceof z.ZodString) return 'string'
  if (schema instanceof z.ZodNumber) return 'number'
  if (schema instanceof z.ZodBoolean) return 'boolean'
  if (schema instanceof z.ZodLiteral) return typeof schema.value
  if (schema instanceof z.ZodArray) return 'array'
  if (schema instanceof z.ZodObject) return 'object'
  return 'unknown'
}

/** Render a Zod schema as a compact JSON-like string for Returns lines. */
function compactSchema(schema: z.ZodTypeAny): string {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema

  if (inner instanceof z.ZodArray) return `[${compactSchema(inner.element)}]`

  if (inner instanceof z.ZodObject) {
    const shape = inner.shape as Record<string, z.ZodTypeAny>
    const parts = Object.keys(shape).map(k => {
      const field = shape[k]
      const opt = field.isOptional() ? '?' : ''
      const fieldInner = field instanceof z.ZodOptional ? field.unwrap() : field
      if (fieldInner instanceof z.ZodArray || fieldInner instanceof z.ZodObject)
        return `"${k}${opt}": ${compactSchema(field)}`
      return `"${k}${opt}"`
    })
    return `{ ${parts.join(', ')} }`
  }

  return zodTypeName(inner)
}

function isOkOnlySchema(schema: z.ZodObject<any>): boolean {
  const keys = Object.keys(schema.shape)
  return keys.length === 1 && keys[0] === 'ok'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateToolsMarkdown(): string {
  const lines: string[] = ['## Tools']

  // Group tools by category, preserving insertion order from allTools
  const groups: { category: string; tools: typeof allTools }[] = []
  for (const tool of allTools) {
    const cat = tool.category ?? 'Other'
    let group = groups.find(g => g.category === cat)
    if (!group) {
      group = { category: cat, tools: [] }
      groups.push(group)
    }
    group.tools.push(tool)
  }

  for (const { category, tools } of groups) {
    lines.push('', `### ${category}`)

    for (const tool of tools) {
      lines.push('', `#### \`${tool.name}\``)
      lines.push(tool.description)

      // Parameters
      const shape = tool.inputSchema.shape as Record<string, z.ZodTypeAny>
      const keys = Object.keys(shape)
      if (keys.length === 0) {
        lines.push('- Parameters: _(none)_')
      } else {
        for (const key of keys) {
          const field = shape[key]
          const type = zodTypeName(field)
          const req = field.isOptional() ? 'optional' : 'required'
          const desc = field.description ?? ''
          lines.push(
            `- \`${key}\` (${type}, ${req})${desc ? ` \u2014 ${desc}` : ''}`
          )
        }
      }

      // Returns (skip trivial { ok: true } schemas)
      if (tool.outputSchema && !isOkOnlySchema(tool.outputSchema)) {
        lines.push(`- Returns: \`${compactSchema(tool.outputSchema)}\``)
      }
    }
  }

  return lines.join('\n')
}
