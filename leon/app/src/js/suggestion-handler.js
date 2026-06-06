import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { WidgetWrapper, List, ListHeader, ListItem } from '@aurora'

export default function handleSuggestions(data, chatbot, client) {
  const container = document.createElement('div')
  container.className = 'bubble-container leon'

  chatbot.feed.appendChild(container)

  const root = createRoot(container)

  root.render(
    createElement(WidgetWrapper, {
      noPadding: true,
      children: createElement(List, {
        children: [
          createElement(ListHeader, {
            children: 'Suggestions'
          }),
          ...data.map((suggestionText) => {
            return createElement(ListItem, {
              children: suggestionText,
              name: 'suggestion',
              value: suggestionText,
              onClick: (suggestion) => {
                // Unmount the React root before removing the DOM node to avoid
                // the memory leak caused by orphaned React roots.
                root.unmount()

                const parent = container.parentNode
                if (parent) {
                  parent.removeChild(container)
                }

                client.input.value = suggestion.value
                client.send('utterance')
              }
            })
          })
        ]
      })
    })
  )
}
