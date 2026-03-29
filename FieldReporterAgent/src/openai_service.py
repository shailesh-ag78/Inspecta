import os
from pathlib import Path
import json
import dotenv
from typing import List, Dict, Any
from openai import OpenAI
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename='.\\task_generator.log',
)
logger = logging.getLogger(__name__)

# Constants


# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
MODEL_TEMPERATURE = float(os.getenv("MODEL_TEMPERATURE", "0.2"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

MODEL= "gpt-4o" # "gpt-5-nano"
MODEL_TEMPERATURE= 0.2  #1  

def safe_int(val, default):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default
class OpenAIService:
    def __init__(self, logger=None):
        self.logger = logger
        if not OPENAI_API_KEY:
            if self.logger:
                self.logger.warning("Warning: OPENAI_API_KEY not set.")
            else:
                print("Warning: OPENAI_API_KEY not set.")
        self.client = OpenAI(api_key=OPENAI_API_KEY)

    def generate_tasks_from_transcript(self, transcript: str, user_prompt: str) -> Dict[str, Any]:
        """
        Uses OpenAI to extract structured tasks from the inspection transcript.
        Returns a dictionary compatible with the database schema.
        """
        
        header_prompt = (
            f"You are an expert industrial inspector helper."
            f"Your job is to analyze the audio transcript of an incident recorded on site and extract a list of ACTIONABLE TASKS."
            f"The audio transcript may contain observations, issues, and comments made by the inspector while walking around the site."
            f"The audio transcript is referred as 'Inspector Comments'."
            f"The inputted transcript is a JSON text that contains segments of the audio transcription with their corresponding timestamps (start second count and end second count)."
            f"Each segment is referred here as a 'transcript segment' and has inspector comments. Each segment has Start time and End time in Seconds"    
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
                    ○ The task dscription shall be accurate and summarizd. Do not add stuff on your own. Do not become too creative here.
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
                                "segment_start_time": "start time of the transcript segment in seconds",
                                "segment_end_time": "end time of the transcript segment in seconds"
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
        
        logger.info(f"Generating tasks from transcript with prompt length {len(system_prompt) + len(user_prompt)} chars (System Prompt: {len(system_prompt)} chars, User Prompt: {len(user_prompt)} chars)")
        try:
            response = self.client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=MODEL_TEMPERATURE,
                response_format={ "type": "json_object" }
            )
            
            # Extract total, prompt, and completion tokens
            usage = response.usage
            prompt_tokens = usage.prompt_tokens if usage else 0        # The words you sent (Input)
            completion_tokens = usage.completion_tokens if usage else 0  # The words AI generated (Output)
            
            cached_tokens = 'N/A'
            if usage and hasattr(usage, 'prompt_tokens_details') and usage.prompt_tokens_details:
                cached_tokens = getattr(usage.prompt_tokens_details, 'cached_tokens', 'N/A')
            logger.info(f"OpenAI API Usage - Prompt Tokens: {prompt_tokens}," + 
                        f" Completion Tokens: {completion_tokens}, " + 
                        f"Cached Tokens: {cached_tokens}")

            logger.info(f"OpenAI response received for task generation. : {response}")
            
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
            
            cleaned_tasks = safe_transform_tasks(content)                
            return cleaned_tasks

        except Exception as e:
            logger.error(f"OpenAI Task Generation Error: {e}")
            raise RuntimeError(f"Failed to generate tasks: {str(e)}")


def safe_transform_tasks(raw_input) -> Dict[str, Any]:
    """
    Robustly transforms raw AI output into a standardized task dictionary.
    Handles strings, empty inputs, and malformed dictionaries.
    """
    processed_data = {}

    # 1. HANDLE NON-DICTIONARY INPUT (Strings/None)
    if not raw_input:
        logging.warning("Received empty input for task transformation.")
        return {"summary": "Error: No data received", "tasks": []}

    if isinstance(raw_input, str):
        try:
            # Try to parse if it's a JSON string
            processed_data = json.loads(raw_input)
        except json.JSONDecodeError:
            logging.error(f"Raw input is a string but not valid JSON: {raw_input[:100]}...")
            return {
                "summary": "Error: AI returned non-JSON text.",
                "tasks": [],
                "metadata": {"raw_response": raw_input} # Keep raw text for debugging
            }
    elif isinstance(raw_input, dict):
        processed_data = raw_input
    else:
        logging.error(f"Unsupported data type: {type(raw_input)}")
        return {"summary": "Error: Unexpected data format", "tasks": []}

    # 2. STANDARDIZED TRANSFORMATION (The "Safe" Way)
    def get_int(val, default):
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    # Extract Summary
    summary = processed_data.get("Summary") or processed_data.get("summary") or "No summary extracted."
    
    # Extract Task Lists (Handle nested TaskList or flat structure)
    task_container = processed_data.get("TaskList", processed_data)
    
    raw_tasks = task_container.get("Task", []) if isinstance(task_container, dict) else []
    raw_clarifications = task_container.get("Clarification Needed", []) if isinstance(task_container, dict) else []

    # Ensure we are iterating over a list even if AI returned a single dict
    if isinstance(raw_tasks, dict): raw_tasks = [raw_tasks]
    if isinstance(raw_clarifications, dict): raw_clarifications = [raw_clarifications]

    cleaned_tasks = {
        "summary": summary,
        "tasks": [
            {
                "task_title": t.get("task_title", "Untitled Task"),
                "task_description": t.get("task_description", ""),
                "severity_id": get_int(t.get("severity_id"), 2),
                "task_type": get_int(t.get("task_type"), 3),
                "start_time": get_int(t.get("segment_start_time"), 0),
                "end_time": get_int(t.get("segment_end_time"), 0)
            } for t in raw_tasks if isinstance(t, dict)
        ],
        "clarification_needed": [
            {
                "task_title": c.get("task_title", "Clarification"),
                "task_description": c.get("task_description", ""),
                "severity_id": get_int(c.get("severity_id"), 3),
                "task_type": get_int(c.get("task_type"), 3)
            } for c in raw_clarifications if isinstance(c, dict)
        ]
    }

    return cleaned_tasks