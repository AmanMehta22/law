import requests
import time

time.sleep(2)
try:
    r = requests.get('http://localhost:8000/health', timeout=5)
    print('Health:', r.json())
    r = requests.post('http://localhost:8000/query', json={'query': 'consumer rights refund', 'top_k': 3}, timeout=10)
    print('Query results:', len(r.json()['results']), 'documents')
    for i, doc in enumerate(r.json()['results']):
        concept_id = doc['metadata'].get('concept_id', 'N/A')
        content = doc['content'][:80]
        print(f'  {i+1}. {concept_id}: {content}...')
except Exception as e:
    print('Error:', e)