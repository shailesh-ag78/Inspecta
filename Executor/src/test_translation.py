import os
import sys
from pathlib import Path
import dotenv
import io

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit import IndicProcessor # Internal AI4Bharat library

# Force stdout to use utf-8 to avoid encoding errors when printing translated text on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Load .env file
project_root = Path(__file__).parent.parent
dotenv.load_dotenv(dotenv_path=project_root / ".env")

# Add the project root to sys.path so we can import packages correctly
sys.path.append(str(project_root))

from src.workflowexecutor import translate_tasks

def aibharat_trasnlation():
    # 1. Load the model and tokenizer (Free download)
    model_name = "ai4bharat/indictrans2-en-indic-dist-200M" 
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name, trust_remote_code=True)
    ip = IndicProcessor(inference_stage="morphological-pre")

    # 2. Prepare text
    english_sentences = ["Fix the solar panel alignment",
                        "The third row solar panel is tilted by 5 degrees. Align it to the standard position."]

    # 3. Format and process for Hindi ("hin_Deva")
    batch = ip.preprocess_batch(english_sentences, src_lang="eng_Latn", tgt_lang="hin_Deva")
    inputs = tokenizer(batch, src=True, return_tensors="pt", padding=True)

    # 4. Generate translation
    with torch.no_grad():
        generated_tokens = model.generate(**inputs, use_cache=True, num_beams=5, max_length=256)

    # 5. Decode output
    outputs = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)
    final_translations = ip.postprocess_batch(outputs, lang="hin_Deva")

    print(final_translations[0])


def main():
    sample_tasks = [
        {
            "task_title": "Fix the solar panel alignment",
            "task_description": "The third row solar panel is tilted by 5 degrees. Align it to the standard position.",
        },
        {
            "task_title": "Check electrical connection",
            "task_description": "Verify that all wiring and connectors are secure and dry.",
        }
    ]

    target_language = "hindi"
    print(f"Original tasks:\n{sample_tasks}\n")
    print(f"Translating to: {target_language}...")

    translated_tasks = aibharat_trasnlation(sample_tasks, target_language)
    
    #translated_tasks = translate_tasks(sample_tasks, target_language)
    
    # print("\nTranslated tasks:")
    # for i, task in enumerate(translated_tasks):
    #     print(f"\nTask {i+1}:")
    #     print(f"  Title (Original): {sample_tasks[i]['task_title']}")
    #     print(f"  Title (Translated): {task.get('task_translated_title')}")
    #     print(f"  Description (Original): {sample_tasks[i]['task_description']}")
    #     print(f"  Description (Translated): {task.get('task_translated_description')}")

if __name__ == "__main__":
    main()
