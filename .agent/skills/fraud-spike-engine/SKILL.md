
---
name: fraud-spike-engine
description: Domain knowledge and implementation guidelines for rolling-window fraud rate tracking, statistical spike detection (Z-score/moving baseline), feature attribution explanations, and time-based evaluation for risk management systems.
---

# Fraud Spike Engine Skill

## Overview
This skill provides guidelines and algorithms for detecting sudden anomalies and statistical spikes in merchant fraud rates rather than evaluating single transactions in isolation.

## Key Concepts
1. **Per-Transaction Scoring vs. Spike Detection**:
   - Per-transaction classifier produces a probability $P(\text{fraud}) \in [0, 1]$.
   - Spike detector computes a moving fraud rate $\bar{f}_w = \frac{1}{|W|} \sum_{t \in W} P(\text{fraud}_t)$ over a short window $W$ (e.g. 15 minutes or last $N$ transactions).
   - Baseline $\mu_B, \sigma_B$ is maintained over a longer historical window $B$ (e.g. last 24 hours or 500 transactions).
   - Spike Score: $Z = \frac{\bar{f}_w - \mu_B}{\sigma_B + \epsilon}$.
   - Alert triggers when $Z \ge \theta_{\text{threshold}}$.

2. **Plain-Language Explainability**:
   - Feature importances and contributions (e.g. Tree SHAP or tree path contributions) are mapped to human-readable explanations:
     - `velocity_15m` $\rightarrow$ "Unusually high transaction velocity from one device/IP"
     - `amount_deviation` $\rightarrow$ "Transaction amounts significantly exceed merchant average ($X vs $Y)"
     - `odd_hour` $\rightarrow$ "Unusual burst of transactions outside standard business hours"
     - `device_novelty` $\rightarrow$ "Spike in unrecognized or newly registered devices"
   - Counterfactual insight: "If transaction velocity was below X/min, this alert would not have triggered."

3. **Time-Based Evaluation Metric (Honest Reporting)**:
   - Train on timestamp $t < T_{\text{split}}$, test on $t \ge T_{\text{split}}$.
   - Compute:
     - Precision: $TP / (TP + FP)$
     - Recall: $TP / (TP + FN)$
     - False Positive Rate: $FP / (FP + TN)$
     - False Positive Cost: $\sum_{FP} (\text{Investigation Overhead} + \text{Merchant Friction Margin})$.
