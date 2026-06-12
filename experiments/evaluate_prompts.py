import os
import json
import time
import mlflow
from sentence_transformers import SentenceTransformer
from google import genai

PROMPT_DIR = os.path.join("experiments", "prompts")
EVAL_FILE = os.path.join("data", "eval.jsonl")
MODEL_NAME = "gemini-2.0-flash"  # adjust if needed

googleclient = genai.Client()
embedder = SentenceTransformer("all-MiniLM-L6-v2")

def load_prompts():
    prompts = {}
    for fn in sorted(os.listdir(PROMPT_DIR)):
        path = os.path.join(PROMPT_DIR, fn)
        if os.path.isfile(path):
            prompts[fn] = open(path, "r", encoding="utf-8").read()
    return prompts

def run_one(template, query):
    prompt = template + "\n\nUser query: " + query
    out = googleclient.models.generate_content(model=MODEL_NAME, contents=prompt)
    return out.text.strip()

def cosine(a, b):
    import numpy as np
    a = np.array(a); b = np.array(b)
    na = (a**2).sum()**0.5; nb = (b**2).sum()**0.5
    if na==0 or nb==0: return 0.0
    return float((a*b).sum() / (na*nb))

def evaluate():
    prompts = load_prompts()
    eval_cases = [json.loads(l) for l in open(EVAL_FILE, "r", encoding="utf-8")]
    mlflow.set_experiment("prompt_evals")
    with mlflow.start_run(run_name=f"eval_{int(time.time())}"):
        for pname, template in prompts.items():
            sims = []
            for case in eval_cases:
                resp = run_one(template, case["query"])
                resp_emb = embedder.encode([resp])[0]
                gt_emb = embedder.encode([case["answer"]])[0]
                sims.append(cosine(resp_emb, gt_emb))
            avg_sim = sum(sims)/len(sims) if sims else 0.0
            mlflow.log_metric(f"avg_embedding_cosine/{pname}", avg_sim)
            print(pname, "avg_sim", avg_sim)
        mlflow.log_param("human_rubric", "Collect 1-5 ratings (factuality/helpfulness) externally and upload as metrics.")
        print("Done. Add human ratings to MLflow as additional metrics if available.")

if __name__ == "__main__":
    evaluate()