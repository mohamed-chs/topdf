# 4. The Math Gauntlet (LaTeX / KaTeX)

This section is the "Hard Mode" for PDF converters. It tests font embedding, symbol scaling, and multi-line alignments.

## 4.1 Inline Math
Testing the baseline: $f(x) = \int_{-\infty}^{\infty} \hat{f}(\xi) e^{2 \pi i \xi x} d\xi$. 
Testing symbol density: $\forall \epsilon > 0, \exists \delta > 0 \text{ s.t. } 0 < |x - c| < \delta \implies |f(x) - L| < \epsilon$.
Testing large operators in text: $\prod_{k=1}^{n} \left( 1 + \frac{1}{k} \right) = n+1$.

## 4.2 Display Math (Complexity Progression)

### 4.2.1 Standard Identities
$$ e^{i\pi} + 1 = 0 $$

$$ \frac{d}{dx} \left( \int_{a}^{x} f(t) dt \right) = f(x) $$

### 4.2.2 Matrices and Arrays
The Jacobian matrix:
$$
\mathbf{J} = \frac{d\mathbf{f}}{d\mathbf{x}} = \begin{bmatrix}
\frac{\partial f_1}{\partial x_1} & \cdots & \frac{\partial f_1}{\partial x_n} \\
\vdots & \ddots & \vdots \\
\frac{\partial f_m}{\partial x_1} & \cdots & \frac{\partial f_m}{\partial x_n}
\end{bmatrix}
$$

### 4.2.3 Multiline Alignment (Maxwell's Equations)
$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0\mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
$$

### 4.2.4 Nested Fractions and Continued Fractions
$$
x = a_0 + \frac{1}{a_1 + \frac{1}{a_2 + \frac{1}{a_3 + \frac{1}{a_4}}}}
$$

### 4.2.5 The "Kitchen Sink" Equation
Testing nested radicals, limits, and large sums:
$$
\sqrt[n]{\frac{\sum_{i=1}^n (x_i - \bar{x})^2}{n-1}} \geq \lim_{h \to 0} \frac{\int_x^{x+h} \sin(t^2) dt}{h} \cdot \left( \biguplus_{j \in J} \mathcal{A}_j \right)
$$
