# Prompt Experiments Report

## Overview
- Use case: property search / comparison
- Strategies implemented:
  - baseline (zero-shot): experiments/prompts/baseline.txt
  - few-shot k=3: experiments/prompts/few_shot_k3.txt
  - few-shot k=5: experiments/prompts/few_shot_k5.txt
  - advanced (CoT): experiments/prompts/cot.txt

## Eval dataset
- path: data/eval.jsonl

## Quantitative results
- Metric: embedding cosine similarity (avg per prompt)
- Logged to MLflow under experiment `prompt_evals`

## Qualitative evaluation
- Human rubric: 1-5 scale for Factuality and Helpfulness (collect externally)

## Insights
- Document prompt structures, performance differences (k=3 vs k=5), robustness, and failure cases here.