import os
from pathlib import Path
import json
import dotenv
from typing import List, Dict, Any
from openai import OpenAI

# Constants


# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)
MODEL = os.getenv("OPENAI_MODEL", "gpt-5-nano")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

def safe_int(val, default):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default
class OpenAIService:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
             print("Warning: OPENAI_API_KEY not set.")
        self.client = OpenAI(api_key=self.api_key)

    def generate_tasks_from_transcript(self, transcript: str, user_prompt: str) -> List[Dict[str, Any]]:
        """
        Uses OpenAI to extract structured tasks from the inspection transcript.
        Returns a list of dictionaries compatible with the database schema.
        """
        
        header_prompt = (
            f"You are an expert industrial inspector helper."
            f"Your job is to analyze the audio transcript of an incident recorded on site and extract a list of ACTIONABLE TASKS."
            f"The audio transcript may contain observations, issues, and comments made by the inspector while walking around the site."
            f"The audio transcript is referred as 'Inspector Comments'."
            f"The inputted transcript is a JSON text that contains segments of the audio transcription with their corresponding timestamps (start second count and end second count)."
            f"Each segment is referred here as a 'transcript segment' and has inspector comments."    
        )
        
        ask = (
            f"Ask: Analyze all provided 'Inspector Comments' and generate two specific sections:"
            f"A. Concise Observation Summary: A 2-3 sentence professional overview of the current site status based on the comments. Focus on the 'what' and the 'where.'"
            f"B. Actionable Task List for each 'transcript segment': "
            f"   A bulleted list of specific, high-priority tasks that need to be completed or corrected. "
        )
        
        instructions = f"""
                	Instructions for Task Extraction:
                    ○ Each task should be clear and actionable, suitable for assignment to a team member. Focus on the 'what' needs to be done and 'where' it needs to be done."
                    ○ Inspector Comments may contain technical, industry specific terms. Use them appropriately while generating tasks.
                    ○ Inspector comments may have some sentences or words in Hindi or Marathi. Generate output in English only.
                    ○ Tone: Professional, objective, and urgent regarding safety.
                    ○ Technical Accuracy: Maintain any specific measurements, floor numbers, or trade-specific terminology (e.g., HVAC, MEP, Grade).
                    ○ Handling Ambiguity: If a comment is unclear, list it under a 'Clarification Needed' section rather than guessing the task." 
                    ○ Safety First: Prioritize any observations related to OSHA/safety violations at the top of the task list.
                    ○ De-noising: Ignore filler words, personal anecdotes, or irrelevant chatter in the raw text.
                    ○ Consider today's date and the current time of the reference. Whenever you provide days and time, provide date as well with reference of current date and time. Dates shall be outputted in dd-mm-yyyy format.
                    """
                    
        output = f"""
                Output Guidelines:
                1. present the output in JSON format that has following sections:
                {{
                    "Summary": "",
                    "TaskList": {{
                        "Task": [
                            {{
                                "task_title": "One line summary of the task",
                                "task_description": "exact description of the action to be taken for the task",
                                "severity_id": "1=Severe, 2=Regular, 3=Low",
                                "task_type": "1=Install, 2=Repair, 3=Verify, 4=Clear", (infer from context, default to Verify (3) if unsure.)                                
                            }}
                        ]
                    }}
                }}
                """
        system_prompt = header_prompt + "\n" + ask + "\n" + instructions + "\n" + output
        
        # task_title TEXT NOT NULL,
        # task_description TEXT,
        # task_original_description TEXT,
        # task_review_comments TEXT,
        # task_notes TEXT,

        # -- Media & Timestamps
        # video_url TEXT,           -- Specific GCS video for this task
        # video_start_ms INTEGER,   -- Start offset in milliseconds
        # video_end_ms INTEGER,     -- End offset in milliseconds

            

        # import tiktoken
        # encoding = tiktoken.get_encoding("cl100k_base")
        # num_tokens = len(encoding.encode(your_full_prompt))
        # print(f"Total tokens: {num_tokens}")
        
        try:
            response = self.client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2,
                response_format={ "type": "json_object" }
            )
            
            content = response.choices[0].message.content.strip()
            
            # Remove markdown code blocks if present (despite instructions)
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                # Remove opening marker (handles ```json or just ```)
                content = content.split('\n', 1)[-1] if '\n' in content else content.lstrip('`')
                # Remove closing marker
                content = content.rsplit('```', 1)[0].strip()
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
                    "severity_id": safe_int(t.get("severity_id"), 2),
                    "task_type": safe_int(t.get("task_type"), 3)
                })
                
            return cleaned_tasks

        except Exception as e:
            print(f"OpenAI Task Generation Error: {e}")
            raise RuntimeError(f"Failed to generate tasks: {str(e)}")
