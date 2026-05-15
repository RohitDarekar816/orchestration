import React, { useEffect, useRef } from 'react'
import classNames from 'clsx'
import Prism from 'prismjs'

// Import common languages for Prism
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-docker'

import { generateKeyId } from '../../lib/utils'

import './code-card.sass'

export interface CodeCardProps {
  code: string
  language?: string
  title?: string
}

export function CodeCard({
  code,
  language = 'none',
  title
}: CodeCardProps): React.JSX.Element {
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current)
    }
  }, [code, language])

  const copyToClipboard = (): void => {
    void navigator.clipboard.writeText(code)
  }

  return (
    <div
      className="aurora-code-card"
      key={`aurora-code-card_${generateKeyId()}`}
    >
      <div className="aurora-code-card__header">
        <div className="aurora-code-card__header-left">
          {language !== 'none' && (
            <span className="aurora-code-card__language">{language}</span>
          )}
          {title && <span className="aurora-code-card__title">{title}</span>}
        </div>
        <button
          className="aurora-code-card__copy"
          type="button"
          onClick={copyToClipboard}
        >
          <i className="ri-file-copy-line" />
          <span>Copy</span>
        </button>
      </div>
      <div className="aurora-code-card__body">
        <pre className={classNames(`language-${language}`)}>
          <code ref={codeRef} className={classNames(`language-${language}`)}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  )
}
