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
    if (token.type === 'text') {
      const isCodeLike = /^(version|services|container_name|build|ports|links|image|volumes):/m.test(token.text) || 
                         /^\s*-?\s*(container_name|image|build|ports|volumes|links):/m.test(token.text);
      if (isCodeLike) {
        return (
          <CodeCard
            key={`markdown-code-${index}`}
            code={token.text}
            language="yaml"
          />
        )
      }
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

    const html = marked.parser([token])

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
