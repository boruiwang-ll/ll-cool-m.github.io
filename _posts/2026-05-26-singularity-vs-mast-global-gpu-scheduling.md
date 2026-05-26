---
layout: post
title: "Singularity & MAST: Where ML Scheduling is Headed"
date: 2026-05-26
---

I've had the pleasure to collaborate on compute infra of Singularity during my time at Microsoft. Going into the new space of Meta's global ML training platform, there's much to learn and as I spent time on learning about MAST, I can't help comparing the two. Here it goes, my learning notes based on publicly available information.

Even tech giants can't solve all ML training problems in one layer, so they attack the system from different places. Microsoft's **Singularity** asks: *how do we make jobs easy to move, pause, and resize?* Meta's **MAST** asks: *how do we place jobs and data well across many regions?*

Both systems operate at very large scale. Both aim to keep scarce GPU capacity doing useful work.

## Singularity: Make Jobs Flexible

Singularity's core idea is to make deep learning jobs preemptible, migratable, and elastic by default, without user code changes.

The main mechanism is the **device-proxy**. It sits between the training process and the GPU. CUDA calls are intercepted with `LD_PRELOAD` and sent to a separate proxy process over shared memory. This keeps GPU-specific state out of the user's process, which makes checkpointing and migration much easier.

This unlocks three things:

1. **Transparent checkpointing.** The system captures CPU and GPU state without asking the user to write checkpoint code.
2. **Distributed barrier.** Workers reach a consistent point before checkpointing, so no collective operation is half-finished.
3. **Transparent elasticity.** A job can run on fewer or more physical GPUs while keeping the same logical world size.

The last point is the most interesting. If a 4-worker data-parallel job is scaled down to 1 GPU, Singularity does not restart it as a 1-worker job. It keeps 4 logical workers and time-slices them on the GPU.

Naively, this would be too expensive because each switch could require copying a huge amount of GPU memory. Singularity avoids most of that with **replica splicing**.

The key observation: in synchronous data-parallel training, replicas have the same model parameters and optimizer state at the end of each mini-batch. Activations and temporary buffers differ, but the big persistent buffers move in lock-step.

So Singularity skips copying shared buffers when the same contents are already available, tries to keep stable buffers at the same GPU addresses, and squashes redundant update operations that would produce the same result on every rank.

The paper reports about 2-3% overhead for transparent time-slicing, and in some larger model-parallel cases even a small speedup because redundant GPU operations are skipped.

What Singularity does not spend much time on is scheduling policy. It mentions global, regional, and workload schedulers, plus GPU-time-fraction SLAs, but the paper is mostly about mechanisms: how to make jobs movable in the first place.

## MAST: Place Data and Jobs Well

MAST starts from a different problem. In Meta's private cloud, users should not need to choose a region and manually make sure their training data is there. They submit a workload, and MAST places both the job and the data.

This matters because training data is huge and spread across regions. If the scheduler sends a job to a region without the right data, the GPUs may sit idle waiting for cross-region reads or data movement.

MAST has a slow path and a fast path.

The slow path is **Tetris**, which decides where training data should live. The paper models this as a mixed integer programming problem, but the production system uses hill climbing for scale and debuggability. Tetris tries to reduce cross-region reads while balancing GPU demand and storage capacity.

The fast path schedules jobs using three layers:

| Responsibility | Scope | Component |
|---|---|---|
| Job queue management | Global | GMS |
| Resource allocation | Regional | RMS |
| Container orchestration | Cluster | CM / Twine |

This split is the main architectural idea. Queue management can be global. Resource allocation happens regionally. Container orchestration stays local because it is heavier and more operationally detailed.

MAST also uses exhaustive search. Relevant regional schedulers compute placement plans, then compete in an auction. Spending milliseconds on a better placement is worth it when the resulting training job may run for hours or days.

The paper reports strong production results: the worst high-priority regional GPU demand-to-supply ratio dropped from 2.63 to 0.98, GPU allocation rate reached 98%, and on-demand data movement was needed for less than 0.1% of workloads.

## Comparison: Business Decides

MAST cites Singularity and says a concrete comparison is hard because Singularity focuses more on elasticity than scheduling policy. I think that is exactly the right way to read the two papers.

The deeper reason may be business shape. Singularity comes from a public-cloud problem. Microsoft cannot assume much about customer code, frameworks, or training loops. The physical fleet is the thing Microsoft owns, while the workload is opaque. So Singularity makes the job-to-GPU binding flexible underneath the user's code: checkpoint it, move it, shrink it, resume it.

MAST comes from a private-cloud problem. Meta owns more of the stack: training data, storage regions, schedulers, cluster managers, and many framework conventions. The job is less fluid because it carries data locality, hardware type, priority, and production constraints with it. So MAST makes the infrastructure more job-aware instead: place data ahead of time, search across regions, and choose the best placement.

So the split is not just technical. Singularity asks: *how can opaque jobs become movable?* MAST asks: *how can owned infrastructure understand jobs well enough to place them?*

Neither approach is complete. A movable job is only useful if the destination has the right data. A smart scheduler is limited if moving a running job still means waiting for checkpoints or losing work.

The natural combined system would use MAST-like data-aware placement with Singularity-like transparent migration and elasticity. That sounds clean on paper, but the real systems are deeply tied to their environments. Singularity depends on the accelerator runtime and device-proxy design. MAST depends on Meta's storage, Twine, and production scheduling stack.

## Takeaway and Community Trends

Singularity makes opaque jobs easier to move. MAST makes owned infrastructure smarter about where jobs should go. A future ML scheduling system will need both instincts.

This is also where Kubernetes is heading. Kubernetes 1.36 introduced alpha Workload Aware Scheduling features: a revised Workload API, a new PodGroup API, atomic PodGroup scheduling, early workload-aware preemption, topology-aware scheduling, and ResourceClaim support for PodGroups through DRA. That is not the same as Singularity's transparent migration or MAST's global data placement, but it shows the center of gravity moving from pod-by-pod scheduling toward workload-level scheduling.

That makes the Singularity/MAST comparison feel less like history and more like a preview. The open question is not whether schedulers should understand ML workloads better. They will. The question is how much intelligence belongs in the execution layer, how much belongs in the scheduling layer, and who owns enough of the stack to connect the two.

## References

- [Singularity: Planet-Scale, Preemptive and Elastic Scheduling of AI Workloads](https://arxiv.org/abs/2202.07848)
- [MAST: Global Scheduling of ML Training across Geo-Distributed Datacenters at Hyperscale](https://www.usenix.org/conference/osdi24/presentation/choudhury)
- [Kubernetes v1.36: Advancing Workload-Aware Scheduling](https://kubernetes.io/blog/2026/05/13/kubernetes-v1-36-advancing-workload-aware-scheduling/)
- [Kubernetes v1.36: More Drivers, New Features, and the Next Era of DRA](https://kubernetes.io/blog/2026/05/07/kubernetes-v1-36-dra-136-updates/)
