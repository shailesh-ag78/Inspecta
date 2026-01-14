import os
import json
from typing import List, Dict, Any
from openai import OpenAI

# Constants
MODEL = "gpt-4o-mini" 

class OpenAIService:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
             print("Warning: OPENAI_API_KEY not set.")
        self.client = OpenAI(api_key=self.api_key)

    def generate_tasks_from_transcript(self, transcript: str) -> List[Dict[str, Any]]:
        """
        Uses OpenAI to extract structured tasks from the inspection transcript.
        Returns a list of dictionaries compatible with the database schema.
        """
        system_prompt = """
        You are an expert industrial inspector helper. Your job is to analyze the audio transcript of an incident
        and extract a list of ACTIONABLE TASKS.
        
        For each task, identify:
        - Task Title (short summary)
        - Task Description (detailed explanation)
        - Severity (1=Severe, 2=Regular, 3=Low)
        - Task Status is always PENDING (1) initially.
        - Task Type (1=Install, 2=Repair, 3=Verify, 4=Clear). infer from context, default to Verify (3) if unsure.
        
        Output the result as a raw JSON list of objects. Do not include markdown code blocks.
        Keys: "task_title", "task_description", "severity_id", "status_id", "task_type_id", "task_original_description"
        
        "task_original_description" should be the exact quote from transcript if possible.
        """

        user_prompt = f"Here is the transcript:\n\n{transcript}"

        try:
            response = self.client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2
            )
            
            content = response.choices[0].message.content.strip()
            
            # Remove markdown code blocks if present (despite instructions)
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
                
            tasks = json.loads(content)
            
            # Validate/Sanitize default fields
            cleaned_tasks = []
            for t in tasks:
                cleaned_tasks.append({
                    "task_title": t.get("task_title", "Untitled Task"),
                    "task_description": t.get("task_description", ""),
                    "task_original_description": t.get("task_original_description", ""),
                    "severity_id": int(t.get("severity_id", 2)),
                    "status_id": int(t.get("status_id", 1)),
                    "task_type_id": int(t.get("task_type_id", 3))
                })
                
            return cleaned_tasks

        except Exception as e:
            print(f"OpenAI Task Generation Error: {e}")
            raise RuntimeError(f"Failed to generate tasks: {str(e)}")
