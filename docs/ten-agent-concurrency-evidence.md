# Ten-Agent Concurrency Evidence Report

**Checked at:** 2026-07-29T22:53:33.619Z

## Summary

- Total agents observed: **200**
- Orchestrators observed: **0**
- Sub-agents observed: **200**
- Failed workflow samples: **0**
- Worker RSS min: **956 MB**
- Worker RSS max: **1357 MB**
- Historical peak meets ten-agent target: **true**

## Claims

- Ten-agent demand supported: **true**
- Ten-orchestrator latency measured: **false**
- Ten-agent memory within budget: **true**

## Provenance

- Historical baseline: 12 total overlapping pokeedge agents, 6 orchestrators, 0 failed sampled ADV queue workflows, worker RSS 314 MB–2.03 GB.
- session_db: 3f9f88dbc6c65a2463945f1cfda1fc59794f411d: /home/jon/.local/share/opencode-projects/3f9f88dbc6c65a2463945f1cfda1fc59794f411d/opencode/opencode.db
- session_db: nogit: /home/jon/.local/share/opencode-projects/nogit/opencode/opencode.db
- session_db: adf61288cf2a241d5c14df50c4129a6b47e64294: /home/jon/.local/share/opencode-projects/adf61288cf2a241d5c14df50c4129a6b47e64294/opencode/opencode.db
- session_db: 4d6b589871e3687c746bf043301cfb4ac98ea049: /home/jon/.local/share/opencode-projects/4d6b589871e3687c746bf043301cfb4ac98ea049/opencode/opencode.db
- process_snapshot: /proc/153345/stat
- process_snapshot: /proc/180994/stat
- process_snapshot: /proc/403056/stat
- process_snapshot: /proc/593251/stat
- process_snapshot: /proc/3618133/stat
- process_snapshot: /proc/3634103/stat
- process_snapshot: /proc/3690869/stat
- process_snapshot: /proc/4006289/stat

## Limits

- Current session DB metadata is null or empty; sessions default to sub-agent classification. Orchestrator split is sourced from the historical baseline only.
- Temporal workflow visibility not sampled in this run; no client provided.
- This report does not measure ten orchestrator latency.
- Total agent count is not equivalent to orchestrator count.

## Historical Peak

- Total agents: 12
- Orchestrators: 6
- Worker RSS: 314 MB – 2081 MB
- Source: historical_baseline
- Provenance: Historical peak recorded from observed pokeedge overlap: 12 total agents, 6 orchestrators, worker RSS 314 MB–2.03 GB.

## Current Session Samples

| sessionId | projectId | isOrchestrator | startedAt | source |
|---|---|---|---|---|
| ses_0500ca31cffe1wxBQSw1nztg4j | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T22:16:29.667Z | session_db |
| ses_0501cb6c1ffe2QoVY8kGaeLwqm | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:58:56.063Z | session_db |
| ses_04ff0ab60ffe19ItGA8H3UOQEX | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T22:47:02.559Z | session_db |
| ses_05005ba97ffe47zOAY1XxlL2Vg | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T22:24:02.408Z | session_db |
| ses_050090122ffeHX4EWm5njbzM3p | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T22:20:27.741Z | session_db |
| ses_0512795c3ffeW5Q4ICEKubVr6g | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T17:07:26.396Z | session_db |
| ses_0501bed51ffedi4FtqXVPUIHDZ | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:59:47.630Z | session_db |
| ses_0501b6a08ffetHG56buM842c6z | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T22:00:21.239Z | session_db |
| ses_05030eedbffed4TY6Lxw6oXoIX | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:36:50.981Z | session_db |
| ses_0503fba91ffeIF0OlPPIe4lTnx | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:20:41.326Z | session_db |
| ses_0503fe687ffengdrhuFzvKnowF | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:20:30.072Z | session_db |
| ses_0504a163cffec7RN3Fe3bhQ4a5 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:09:22.499Z | session_db |
| ses_0504e40f6ffeDZCBq9FQMo1yfz | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:04:49.418Z | session_db |
| ses_0504e4111ffes56D8us1xvGyql | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:04:49.390Z | session_db |
| ses_0504e4133ffe4nooovSGRwvXDK | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T21:04:49.356Z | session_db |
| ses_05064258affeNCzMIWDjKtbEAd | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T20:40:54.645Z | session_db |
| ses_05076ad75ffeZWclcTsRoIhuuH | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T20:20:40.202Z | session_db |
| ses_0507b6a2fffeh3R4EPih1ey9gu | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T20:15:29.744Z | session_db |
| ses_0507b96fbffe95aInk7XFQw6Vb | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T20:15:18.276Z | session_db |
| ses_0509bc345ffe0BZdlPUh8YCl2y | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:40:09.786Z | session_db |
| ses_050e6cc55ffe5QBZpEIr9rsCh4 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:18:12.267Z | session_db |
| ses_0509fdfdbffei03VydDN565ZP8 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:35:40.324Z | session_db |
| ses_0509ca269ffe58J6hJ56F38W0o | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:39:12.662Z | session_db |
| ses_050edacb7ffeO7Mib2a8FsD9Ue | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:10:41.608Z | session_db |
| ses_0509ba707ffew7x6WsET7NQqhX | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:40:17.016Z | session_db |
| ses_0509f2455ffecZOHrHTRrDPlPz | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:36:28.330Z | session_db |
| ses_050a1c7d7ffeJq6SXhbANrB34F | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:33:35.400Z | session_db |
| ses_050a8db82ffeVxg61uBzekGjtM | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:25:51.613Z | session_db |
| ses_050ab0ae4ffeO4hXm5vcY2atca | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:23:28.411Z | session_db |
| ses_050bc7c9effenQsvvXVyNG6ysQ | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:04:25.185Z | session_db |
| ses_050b20ddcffeKWndSs2oOlRjJ3 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:15:48.899Z | session_db |
| ses_050b307cbffeRk6CAvmxSmXCK5 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:14:44.916Z | session_db |
| ses_050ba5cb7ffe6sbf2d9nKgZiX7 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T19:06:44.424Z | session_db |
| ses_050caba48ffepxtB2Z4uRTVBE1 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:48:51.895Z | session_db |
| ses_050c3def3ffeFfWqgCimV80H4m | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:56:21.261Z | session_db |
| ses_050c42006ffesFcoWtIE3ubOB1 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:56:04.601Z | session_db |
| ses_050c50c02ffe9NTqIqinpnsy45 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:55:04.190Z | session_db |
| ses_050d2e2c2ffeNBWdmWzRnXlxcG | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:39:57.245Z | session_db |
| ses_050cb9fdbffe6TbFz6hQQ38GJt | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:47:53.124Z | session_db |
| ses_050d16ebcffeO3Y37eSSbbux76 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:41:32.483Z | session_db |
| ses_050d8060bffeUuHPMLL3XdNzDr | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:34:20.532Z | session_db |
| ses_050daed85ffed8AJI9lHP0EZMI | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:31:10.202Z | session_db |
| ses_050e4e92cffeBca9punjm6XbV4 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:20:15.955Z | session_db |
| ses_050e13599ffeM6eEcvAEL3b4Tv | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:24:18.534Z | session_db |
| ses_050eceee9ffeVPaHm8CzkFIm86 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:11:30.198Z | session_db |
| ses_050efe394ffeWHRIC80GRAljlC | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:08:16.491Z | session_db |
| ses_050f634d7ffe6UsCvzxRmObIIb | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T18:01:22.472Z | session_db |
| ses_051003e47ffebxOv70R6zSnysE | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T17:50:24.696Z | session_db |
| ses_05102602bffecC7Y1YCyMlxZ6k | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T17:48:04.948Z | session_db |
| ses_051137b32ffeE7DmhTGFFTldpo | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T17:29:23.917Z | session_db |
| ses_05119f89affeNbWYwgb72gEqVr | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T17:22:18.597Z | session_db |
| ses_0514ad061ffeffLhFnfXGtCmcq | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T16:28:57.630Z | session_db |
| ses_051211e9dffe5rYBDmQVdIY1u0 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T17:14:30.114Z | session_db |
| ses_05124ee52ffedoL2G05fNhhM5X | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T17:10:20.333Z | session_db |
| ses_0513793abffelwjM1yzg2e2jtx | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T16:49:58.356Z | session_db |
| ses_0552ac288ffe3QynXBKZ9k3z2A | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T22:25:29.463Z | session_db |
| ses_05532fc6dffeg5VYTl1KDq3Q1o | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T22:16:30.354Z | session_db |
| ses_0540eb3edffeV2YiH59hh606mM | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-29T03:35:45.426Z | session_db |
| ses_05881e0b0ffeHPntDtxPCGFSEo | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T06:51:28.464Z | session_db |
| ses_05630fd56ffee05r5gFDI2oq2c | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:39:03.978Z | session_db |
| ses_055fa9daeffeokJnZSTSKtTZNa | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T18:38:27.409Z | session_db |
| ses_055ff88a0ffeEOxgiD4lJ361L3 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T18:33:05.119Z | session_db |
| ses_055ff21ceffefbNUASLK5B6bii | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T18:33:31.441Z | session_db |
| ses_055ff6e23ffer6g53tZiAwggEu | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T18:33:11.900Z | session_db |
| ses_056052431ffeqhLxTxQU9RD40D | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T18:26:57.614Z | session_db |
| ses_05894fef3ffemIZPBqmuaidZyp | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T06:30:35.532Z | session_db |
| ses_0560aa414ffeBn3aT3UPKYXOEm | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T18:20:57.195Z | session_db |
| ses_056123409ffecVneSV5Rb3dXRH | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T18:12:41.590Z | session_db |
| ses_05841611bffeMo6vEnaxkEoJHt | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:01:55.428Z | session_db |
| ses_0562fe989ffe0cv7LArzyVTuhJ | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:40:14.582Z | session_db |
| ses_056375165ffe6DV2pXjfyRG8Zv | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:32:09.243Z | session_db |
| ses_05640c67cffejyZG2BMVBVzTR0 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:21:49.444Z | session_db |
| ses_05639f1ebffeBA9xfAxTDg5yM3 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:29:17.076Z | session_db |
| ses_0563b6bf9ffejJLm66HL3eHRyo | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:27:40.295Z | session_db |
| ses_0564be0c4ffetcOx006cRZ3UfG | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:09:41.819Z | session_db |
| ses_0564be090ffeRO8WytaFQrJ69n | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:09:41.871Z | session_db |
| ses_056513021ffegn7A3LM5CFygcN | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T17:03:53.822Z | session_db |
| ses_0565a4371ffeuTdvMUC6Az8xYV | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:53:59.054Z | session_db |
| ses_0565aa92cffeGJZc3iO1pppLtj | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:53:33.011Z | session_db |
| ses_0565f7a30ffeC3jKtL6Nk2TUl5 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:48:17.359Z | session_db |
| ses_05662058fffe7zonQCl8b1LltL | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:45:30.608Z | session_db |
| ses_056662e1cffeWnffR9rggGIpar | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:40:58.083Z | session_db |
| ses_0566a225effeq92IzR3iN74tmd | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:36:38.945Z | session_db |
| ses_0566baac1ffeAvn1taNi00Thja | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:34:58.494Z | session_db |
| ses_0567166aaffeU5F25u92zCnugJ | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T16:28:42.710Z | session_db |
| ses_056d78c17ffeBarnvXD4v0zqvf | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T14:37:08.456Z | session_db |
| ses_056e37b11ffeVCPsVtwfAUw3F7 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T14:24:06.382Z | session_db |
| ses_057d533deffezanVROtVUusICj | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T10:00:04.897Z | session_db |
| ses_057d887afffeoEKgyqaTAPZ8w7 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:56:26.832Z | session_db |
| ses_057de812effeS22mzvz6rY0GV4 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:49:55.281Z | session_db |
| ses_057e4aeefffeswFDc95fxsxTGs | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:43:10.352Z | session_db |
| ses_057e95e9cffekZR6KB27HN36B7 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:38:03.235Z | session_db |
| ses_057efbabeffedgjPFS9D7GAwBd | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:31:06.433Z | session_db |
| ses_057f69283ffeOE55kBKhUrrKfX | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:23:37.980Z | session_db |
| ses_057fb7e23ffeQJAy9KKETa8u1M | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:18:15.517Z | session_db |
| ses_057fccdb6ffelItUPpaNjiVmOC | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:16:49.609Z | session_db |
| ses_057fdc1ffffe1tGZOq1pn4O6T5 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:15:47.072Z | session_db |
| ses_058005658ffeQnVyu2Im4sUgjo | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T09:12:58.023Z | session_db |
| ses_0580ff7bcffeFe3t3tM4r9BuUn | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:55:53.667Z | session_db |
| ses_0581a5b7bffeU4ZRgXl1Lx5DY1 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:44:32.772Z | session_db |
| ses_0582599abffee1RGgiP9MKL423 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:32:15.956Z | session_db |
| ses_058293052ffeqn5YjCNx20oS3g | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:28:20.781Z | session_db |
| ses_0582fdf01ffeimnDS3SgpGuaZE | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:21:02.846Z | session_db |
| ses_05837a501ffe1lupMrrWfD5igk | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:12:33.406Z | session_db |
| ses_05837e414ffevdeeSavY8kCa9A | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:12:17.259Z | session_db |
| ses_0583948f7ffeazvQbe6VYtO4Ei | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:10:45.896Z | session_db |
| ses_05841d182ffejw7GdtJLlI3Ksu | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:01:26.653Z | session_db |
| ses_05841ada5ffeqJt9Sy07YkzUfp | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T08:01:35.835Z | session_db |
| ses_0584664acffe3H7f4dq20SenV6 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T07:56:26.835Z | session_db |
| ses_058565985ffe6hpdulmRyTT30T | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T07:39:01.114Z | session_db |
| ses_058acc174ffeQfTh7gyfZdwtKN | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T06:04:38.411Z | session_db |
| ses_05861a43dffeV3y6RX3eTLO2S0 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T07:26:41.090Z | session_db |
| ses_05867c44cffe9PByE7vfDpH3oe | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T07:19:59.667Z | session_db |
| ses_0586e41ebffe969IPZfIX0yiIO | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T07:12:54.292Z | session_db |
| ses_058744faeffeibSFmZ7wQnnJOk | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T07:06:17.553Z | session_db |
| ses_0587d5864ffeQlrLskCmV4rBod | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T06:56:25.499Z | session_db |
| ses_0587d5889ffeLIGyFuBh5FfK56 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T06:56:25.462Z | session_db |
| ses_058844849ffe1vlQHyhCMVmuTl | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T06:48:50.870Z | session_db |
| ses_05889eec0ffei1fZPLZ9JGUP5T | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T06:42:40.575Z | session_db |
| ses_059b4d3aaffelSdLSf3lXhd4wv | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T01:16:12.245Z | session_db |
| ses_05a3bf10affehoUAJk1mqYEkWE | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T22:48:37.365Z | session_db |
| ses_05a28772bffexWQi5X4le0qGdm | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T23:09:53.748Z | session_db |
| ses_059f72b13ffeB7R9xwb2NwYEV1 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-28T00:03:44.493Z | session_db |
| ses_05a02f143ffeMWIqOAo8rl5E2V | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T23:50:52.860Z | session_db |
| ses_05a0d2941ffeBhDRigcpi2S91T | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T23:39:43.166Z | session_db |
| ses_05a1ccecfffe3dbPRnmOBlwwP4 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T23:22:37.744Z | session_db |
| ses_05a24adaeffeoVlQ3mnRo6u2NY | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T23:14:01.937Z | session_db |
| ses_05b155e7fffe9Q362cYUx5lJzn | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T18:51:08.032Z | session_db |
| ses_05df05e0cffegC3TVfy3WEvVaZ | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T05:32:41.333Z | session_db |
| ses_05f0c177bffezP21FkZZYAmdQz | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-27T00:22:47.172Z | session_db |
| ses_05f3480beffeV9ROK9P0GVzCN6 | 3f9f88dbc6c65a2463945f1cfda1fc59794f411d | false | 2026-07-26T23:38:38.785Z | session_db |
| ses_0586850efffe0ZZBQkqJwEtxxZ | nogit | false | 2026-07-28T07:19:23.664Z | session_db |
| ses_050d57809fferjEm8YuNGApWfc | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T18:37:07.959Z | session_db |
| ses_050476d9cffeb8t1xV4nDFP7Ro | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T21:12:16.739Z | session_db |
| ses_050681687ffelbolK6hrn0MTjX | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T20:36:36.344Z | session_db |
| ses_0507c6f1bffeoGhfkjP6IpnfLc | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T20:14:22.948Z | session_db |
| ses_0507d0368ffeCr2sHX65H6PA7h | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T20:13:44.983Z | session_db |
| ses_05094e7fbffeNaHqQTosmOD6o6 | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T19:47:39.140Z | session_db |
| ses_050a09250ffe0Emw384CSqIPIp | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T19:34:54.640Z | session_db |
| ses_050b4c183ffeCWAzK2YPevDVuJ | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T19:12:51.836Z | session_db |
| ses_050bcaf5bffebWcaniYOsDZumP | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T19:04:12.196Z | session_db |
| ses_050c4b1afffesm63dhsRSdIZ89 | adf61288cf2a241d5c14df50c4129a6b47e64294 | false | 2026-07-29T18:55:27.312Z | session_db |
| ses_05db5d9bdffekaRca4BzWsM3U2 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:36:36.290Z | session_db |
| ses_0636790eeffeMzNg9W2qk4uTOt | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-26T04:04:23.441Z | session_db |
| ses_05b67b1aeffejNYc1Oh2qZFARu | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T17:21:12.785Z | session_db |
| ses_05b920980ffeqE1so3HSnom3Pd | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T16:34:57.791Z | session_db |
| ses_05b697fa2ffeCid9yw00gS5YAt | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T17:19:14.525Z | session_db |
| ses_05f41d337ffe0TApF9tw0xy16i | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-26T23:24:05.704Z | session_db |
| ses_05b8dde9fffeZdMygUEK1ELik1 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T16:39:30.912Z | session_db |
| ses_05b936d0affeaitZgi231MQ0j4 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T16:33:26.773Z | session_db |
| ses_05f1d31edffeG7hwLIBzBpfPkf | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T00:04:06.290Z | session_db |
| ses_05b9ce628ffemOSV5hPmo7DSgc | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T16:23:05.944Z | session_db |
| ses_06f627b24ffeilErHfbZn2xPdO | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-23T20:14:30.107Z | session_db |
| ses_05b97088effeglND8mkHBAYG0Q | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T16:29:30.353Z | session_db |
| ses_05de339e5ffeX5TNOT0yiba4TE | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:47:02.555Z | session_db |
| ses_05d1bd9f4ffe6hb5toCQIbvclN | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T09:24:48.780Z | session_db |
| ses_05d1bd9d7ffeQoUBCzykslVhEz | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T09:24:48.808Z | session_db |
| ses_05d1ca064ffe5Xoo3LMdShgAP3 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T09:23:57.979Z | session_db |
| ses_05d1ca081ffeW2P7LuL7KI8O5b | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T09:23:57.950Z | session_db |
| ses_05da2f847ffeCy0ZLU4KqYufAH | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:57:13.656Z | session_db |
| ses_05da52fbfffeG72HpCbb3jBSPE | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:54:48.384Z | session_db |
| ses_05da9c15affeMkhXq5Dk0SH5Bz | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:49:48.965Z | session_db |
| ses_05da2f81fffe6Scl1fEVkko7ds | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:57:13.696Z | session_db |
| ses_05daae6b9ffeEr9Uvg63dSqXZP | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:48:33.862Z | session_db |
| ses_05da87249ffeGSBR0bn2FOUYa9 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:51:14.742Z | session_db |
| ses_05da88cd1ffe1xmBg6ugIlShZz | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:51:07.950Z | session_db |
| ses_05db21bbdffepQWSHGX2MLnYCO | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:40:41.538Z | session_db |
| ses_05dbe6004ffey5jwPfHpNYXUD5 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:27:17.627Z | session_db |
| ses_05db16591ffekxWPy5SfBcMBzS | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:41:28.175Z | session_db |
| ses_05db21be9ffeUMoH073NJh5ApG | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:40:41.494Z | session_db |
| ses_05db21b98ffefsepR6wAghKHrf | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:40:41.575Z | session_db |
| ses_05db51c7affec5cnLA5AzmnPji | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:37:24.741Z | session_db |
| ses_05dc295e8ffeMrnjx2C2eKB35h | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:22:41.687Z | session_db |
| ses_05db75d5affehjv5WIPAM4MzPT | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:34:57.061Z | session_db |
| ses_05f33e80bffeJEWTKhvCsn32Sr | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-26T23:39:17.877Z | session_db |
| ses_05dca5524ffeu5j48kKn9UXmph | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:14:13.979Z | session_db |
| ses_05dbe2282ffeNFpQ7Aw0Fffxjt | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:27:33.373Z | session_db |
| ses_05dc1f53affeqqCZIfovWKSiwM | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:23:22.821Z | session_db |
| ses_05dbfa77fffeB6Gug9HMpMbqx3 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:25:53.792Z | session_db |
| ses_05dc061a1ffeQJMdlaf6kTX4gi | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:25:06.142Z | session_db |
| ses_05dc061c7ffeHhNN5Frrw7Jw3R | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:25:06.104Z | session_db |
| ses_05dc7900bffezrB1vnThVLB0qD | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:17:15.508Z | session_db |
| ses_05dc8022bffeujahyo2VF6FKWp | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:16:46.292Z | session_db |
| ses_05dc6afb9ffepNh3mOaFM302Z2 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:18:12.934Z | session_db |
| ses_05dc868b9ffeavA3ZJ3CUT8l51 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:16:20.038Z | session_db |
| ses_05dde5d10ffeWpaSqhqmEZlc2W | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:52:21.231Z | session_db |
| ses_05dcdea07ffeP81Qpo4ziIqJ4j | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T06:10:19.256Z | session_db |
| ses_05ddfe1c5ffeXpVUgslvlHy15Q | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:50:41.722Z | session_db |
| ses_05ddd4eb1ffeI2DxmPjQWa1stU | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:53:30.446Z | session_db |
| ses_05de26314ffexYAY1Z5Ee6PKmK | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:47:57.547Z | session_db |
| ses_05de0ab52ffel3bPChIscQlAxa | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:49:50.125Z | session_db |
| ses_05de0f240ffe2wjNtOoLQDFLyN | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:49:31.967Z | session_db |
| ses_05de41905ffeB4jgl7FZXEb2GB | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:46:05.434Z | session_db |
| ses_05de4c2e5ffen5xSB7StVrx6PY | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:45:21.946Z | session_db |
| ses_05de418b5ffePuh1LgQAWyqiB4 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:46:05.514Z | session_db |
| ses_05df50370ffeI9q5ThsA4NKwiE | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:27:36.847Z | session_db |
| ses_05de418deffeydhhu0Dyxt95h8 | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:46:05.473Z | session_db |
| ses_05de7af94ffe06KJgL4j4F1KcM | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:42:10.283Z | session_db |
| ses_05de80027ffepg3T45BtrzQUUY | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:41:49.657Z | session_db |
| ses_05de7afbafferezQTfJ5iqD8Py | 4d6b589871e3687c746bf043301cfb4ac98ea049 | false | 2026-07-27T05:42:10.245Z | session_db |

## Current Process Samples

| pid | rssMb | command | source |
|---|---|---|---|
| 153345 | 1107 | opencode | process_snapshot |
| 180994 | 1175 | opencode | process_snapshot |
| 403056 | 1054 | opencode | process_snapshot |
| 593251 | 956 | opencode --agent adv --prompt /adv-idea in windows terminal i want to make my... | process_snapshot |
| 3618133 | 1357 | opencode --session ses_0512795c3ffeW5Q4ICEKubVr6g | process_snapshot |
| 3634103 | 1278 | opencode --session ses_0510f8f29ffeoqfpXQYMIYTAtO | process_snapshot |
| 3690869 | 1270 | opencode | process_snapshot |
| 4006289 | 1185 | opencode | process_snapshot |

## Workflow Samples

No workflow samples available.
