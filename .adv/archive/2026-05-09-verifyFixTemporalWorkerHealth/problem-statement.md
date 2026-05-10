GitHub issue: https://github.com/Sharper-Flow/Advance/issues/33

Temporal worker health check can report false-negative: worker is alive but diagnose shows dead. This impacts ADV recovery and checkpoint/worker restart decisions. Issue is labeled `needs-verify`, so verify-first before changing code.