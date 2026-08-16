from pathlib import Path
import os
from dotenv import load_dotenv
PROJECT_ROOT = Path(__file__).resolve().parents[2]

load_dotenv(PROJECT_ROOT / ".env")

DATA_PATH = (PROJECT_ROOT/"legal-dataset"/"acts"/"consumer-protection-act-2019"/"final"/"v2-knowledge-cards.json")

V1_DATA_PATH = (PROJECT_ROOT/"legal-dataset"/"acts"/"consumer-protection-act-2019"/"final"/"v1-statute.json")



CHROMA_PATH = (PROJECT_ROOT/"RAG"/ "data"/ "chroma_db")

COLLECTION_NAME = "consumer_protection_act"



EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL","sentence-transformers/all-MiniLM-L6-v2")




TOP_K = int(os.getenv("TOP_K", "5"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")