---
title: A Structured Analysis of Rendering Fidelity
toc: true
tocDepth: 3
---

# A Structured Analysis of Rendering Fidelity

## Abstract

This style pack targets long-form reading with stable line rhythm and print-focused spacing.

## Method

The key equation uses MathJax inline $f(x)=\int_0^1 x^2 dx$ and display mode:

$$
\nabla \cdot \mathbf{F} = \frac{\partial F_x}{\partial x}+\frac{\partial F_y}{\partial y}+\frac{\partial F_z}{\partial z}
$$

<div class="theorem">
<strong>Theorem.</strong> If layout primitives are deterministic, PDF output remains visually stable.
</div>

## Results

| Condition | Observation |
| --- | --- |
| Custom template | Stable wrapper geometry |
| Header/footer | Repeatable metadata band |
| Relative assets | Correct with base path |
