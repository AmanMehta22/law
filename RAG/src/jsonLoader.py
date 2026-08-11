import json
from pathlib import Path
from typing import List, Dict, Any


class JSONKnowledgeLoader:

    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)

    def load(self) -> List[Dict[str, Any]]:
        """
        Load all knowledge cards from the JSON file.
        """

        if not self.file_path.exists():
            raise FileNotFoundError(
                f"Knowledge card file not found: {self.file_path}"
            )

        if self.file_path.suffix.lower() != ".json":
            raise ValueError(
                f"Expected a JSON file, got: {self.file_path.suffix}"
            )

        with open(
            self.file_path,
            "r",
            encoding="utf-8"
        ) as file:

            data = json.load(file)

        if not isinstance(data, list):
            raise ValueError(
                "Expected the knowledge-card JSON to contain a list."
            )

        return data