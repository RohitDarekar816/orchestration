import React, { useMemo } from 'react'
import { marked, type Token } from 'marked'

import { CodeCard } from '../code-card'

import './markdown.sass'

export interface MarkdownProps {
  content: string
}

export function Markdown({ content }: MarkdownProps): React.JSX.Element {
  const tokens = useMemo(() => {
    // Configure marked for GFM and line breaks
    marked.setOptions({
      gfm: true,
      breaks: true
    })

    return marked.lexer(content)
  }, [content])

  const renderToken = (
    token: Token,
    index: number
  ): React.JSX.Element | null => {
    // Robust detection: Look for YAML or Docker Compose markers in text blocks
    const isCodeLike = /^(version|services|container_name|build|ports|links|image|volumes):/m.test(token.text) || 
                       /^\s*-?\s*(container_name|image|build|ports|volumes|links):/m.test(token.text);

    if (token.type === 'text' && isCodeLike) {
      return (
        <CodeCard
          key={`markdown-code-${index}`}
          code={token.text}
          language="yaml"
        />
      )
    }

    if (token.type === 'code') {
      return (
        <CodeCard
          key={`markdown-code-${index}`}
          code={token.text}
          language={token.lang || 'text'}
        />
      )
    }

    // For other tokens, we use dangerouslySetInnerHTML on a div
    // We wrap it in the parser to get the HTML string for this specific token
    const html = marked.parser([token])

    // Post-process HTML for Leon-specific markers like [FILE_PATH]
    const processedHtml = html.replace(
      /\[FILE_PATH\](.*?)\[\/FILE_PATH\]/g,
      (_match, filePath) => {
        return `<span class="clickable-path" data-path="${filePath}" title="Open in file explorer">${filePath}</span>`
      }
    )

    return (
      <div
        key={`markdown-part-${index}`}
        className="aurora-markdown__part"
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    )
  }

  return <div className="aurora-markdown">{tokens.map(renderToken)}</div>
}
