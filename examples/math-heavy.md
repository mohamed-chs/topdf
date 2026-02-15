# MathJax Stress Test

This document combines baseline and hard-mode math coverage for fidelity validation.

## Inline Math

The Gaussian integral is $\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$.
The value of $\zeta(2) = \sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$.

Baseline check: $f(x) = \int_{-\infty}^{\infty} \hat{f}(\xi) e^{2 \pi i \xi x} d\xi$.
Symbol density: $\forall \epsilon > 0, \exists \delta > 0 \text{ s.t. } 0 < |x - c| < \delta \implies |f(x) - L| < \epsilon$.
Large operators: $\prod_{k=1}^{n} \left( 1 + \frac{1}{k} \right) = n+1$.

## Display Math

### Standard Identities

$$ e^{i\pi} + 1 = 0 $$

$$ \frac{d}{dx} \left( \int_{a}^{x} f(t) dt \right) = f(x) $$

### Maxwell's Equations

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0\left(\mathbf{J} + \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}\right)
\end{aligned}
$$

### Matrices and Arrays

The Jacobian matrix:

$$
\mathbf{J} = \frac{d\mathbf{f}}{d\mathbf{x}} = \begin{bmatrix}
\frac{\partial f_1}{\partial x_1} & \cdots & \frac{\partial f_1}{\partial x_n} \\
\vdots & \ddots & \vdots \\
\frac{\partial f_m}{\partial x_1} & \cdots & \frac{\partial f_m}{\partial x_n}
\end{bmatrix}
$$

Rectangular matrix stress case:

$$
A = \begin{pmatrix}
a_{11} & a_{12} & \cdots & a_{1n} \\
a_{21} & a_{22} & \cdots & a_{2n} \\
\vdots & \vdots & \ddots & \vdots \\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{pmatrix}
$$

### Nested and Continued Fractions

$$
x = a_0 + \frac{1}{a_1 + \frac{1}{a_2 + \frac{1}{a_3 + \frac{1}{a_4}}}}
$$

### Kitchen Sink Equation

$$
\sqrt[n]{\frac{\sum_{i=1}^n (x_i - \bar{x})^2}{n-1}} \geq \lim_{h \to 0} \frac{\int_x^{x+h} \sin(t^2) dt}{h} \cdot \left( \biguplus_{j \in J} \mathcal{A}_j \right)
$$

## Escaped Dollars

I have \$100 and \$50, which is not math.
But $x = 5$ is math.
