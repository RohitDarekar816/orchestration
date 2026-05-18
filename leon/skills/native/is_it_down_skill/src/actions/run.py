from bridges.python.src.sdk.leon import leon
from bridges.python.src.sdk.types import ActionParams
from bridges.python.src.sdk.network import Network

from typing import Union, Literal


def run(params: ActionParams) -> None:
    """Check if a website is down or not"""

    import re

    domains: list[str] = []
    action_arguments = params.get('action_arguments', {})
    domain = action_arguments.get('domain')
    if isinstance(domain, str) and len(domain) > 0:
        normalized_domain = domain.lower().strip()
        normalized_domain = normalized_domain.replace('https://', '').replace('http://', '')
        normalized_domain = normalized_domain.rstrip('/')
        domains.append(normalized_domain)

    if len(domains) == 0:
        utterance = params.get('utterance', '')
        domain_match = re.search(
            r'https?://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}|'
            r'([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}',
            utterance.lower()
        )
        if domain_match:
            raw = domain_match.group(0)
            normalized = raw.replace('https://', '').replace('http://', '').rstrip('/')
            domains.append(normalized)

    if len(domains) == 0:
        leon.answer({
            'key': 'invalid_domain_name',
            'data': {
                'website_name': 'this domain'
            }
        })
        return

    network = Network()

    for domain in domains:
        website_name = domain[:domain.find('.')].title()

        leon.answer({
            'key': 'checking',
            'data': {
                'website_name': website_name
            }
        })

        urls_to_try = ['https://' + domain]
        if not domain.startswith('www.'):
            urls_to_try.append('https://www.' + domain)

        reached = False
        for attempt_url in urls_to_try:
            try:
                network.request({'url': attempt_url, 'method': 'GET'})
                reached = True
                break
            except Exception as e:
                if not network.is_network_error(e):
                    leon.answer({
                        'key': 'errors',
                        'data': {
                            'website_name': f'{website_name} ({attempt_url})'
                        }
                    })
                    return

        state: Union[Literal['up'], Literal['down']] = 'up' if reached else 'down'

        leon.answer({
            'key': state,
            'data': {
                'website_name': website_name
            }
        })
