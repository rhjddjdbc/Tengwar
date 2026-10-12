# Welcome to Tengwar

A **native Rust + Tauri** Markdown editor with diagrams, LaTeX, Git, and more.
Everything below works **offline** — no external services.

---

## Tabs & files

- Open files from the sidebar → each becomes a **tab**
- **Ctrl+W** closes a tab · **Ctrl+Tab** cycles between tabs
- **Ctrl+S** saves · enable **Auto-save** in ⚙️ Settings
- A **● dot** on a tab name means unsaved changes

## Markdown

**Bold**, *italic*, ~~strikethrough~~, `inline code`, [links](https://example.com).

## Task lists

- [x] Rust backend with 19 diagram types
- [x] Tabs, auto-save, fuzzy search
- [x] LaTeX rendering
- [x] Light/dark preview
- [ ] Your next great note

## Tables

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Fuzzy-find files |
| `Ctrl+F` | Fuzzy-find lines |
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+= / Ctrl+-` | Zoom preview |
| `Ctrl+Shift+D` | Toggle dark preview |
| `Ctrl+Shift+V` | Toggle Vim mode |
| `Ctrl+Shift+S` | Toggle auto-save |
| `:` | Vim command popup |

## LaTeX

Inline math: $E = mc^2$ and $\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$

Display math:

$$
\frac{d}{dx}\left( \int_a^x f(t)\,dt \right) = f(x)
$$

## Blockquote

> The best way to predict the future is to invent it.
> — Alan Kay

---

# Diagrams

## Class Diagram

```mermaid
classDiagram
  class Shape {
    <<interface>>
    +area() double
  }
  class Circle {
    +double radius
    +area() double
  }
  class AbstractNote {
    <<abstract>>
    +String text
  }
  Shape <|.. Circle
  note for Shape "All shapes implement this"
```

## Sequence Diagram

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server
  Note over C,S: Handshake
  C->>+S: Request
  S->>S: Process
  S-->>-C: Response
  alt Success
    S-->>C: OK
  else Failure
    S-->>C: Error
  end
  loop Every 30s
    C->>S: Ping
  end
```

## State Diagram

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Active : start
  state Active {
    [*] --> Running
    Running --> Paused : pause
    Paused --> Running : resume
  }
  Active --> Done : finish
  Done --> [*]
```

## ER Diagram

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ITEM : contains
  PRODUCT ||--o{ ITEM : references
  CUSTOMER {
    int id PK
    string name
    string email
  }
  ORDER {
    int id PK
    date created
    int customer_id FK
  }
```

## Flowchart

```mermaid
flowchart TD
  subgraph Frontend
    A[UI] --> B[State]
  end
  subgraph Backend
    C[API] --> D[DB]
  end
  B --> C
  D --> E{OK?}
  E -->|yes| F[Done]
  E -->|no| C
```

## Pie Chart

```mermaid
pie title Time spent coding
  "Rust" : 45
  "Markdown" : 20
  "Debug" : 25
  "Coffee" : 10
```

## Gantt

```mermaid
gantt
  title Sprint 12
  section Design
    Wireframes :done, 5d
    Mockups :active, 4d
  section Dev
    Backend :crit, 10d
    Frontend :8d
    Ship :milestone, 0d
```

## Mindmap

```mermaid
mindmap
  Root
    Frontend
      React
      Vue
    Backend
      Rust
      Go
    Data
      Postgres
      Redis
```

## Timeline

```mermaid
timeline
  title Product roadmap
  Q1 : Kickoff : Research
  Q2 : Prototype : MVP
  Q3 : Beta
  Q4 : Launch
```

## Journey

```mermaid
journey
  title Morning routine
  section Wake up
    3: Alarm: Me
    5: Coffee: Me
  section Work
    4: Emails: Me, Team
    2: Meeting: Me, Boss
```

## Quadrant Chart

```mermaid
quadrantChart
  title Feature priorities
  x-axis Low Effort --> High Effort
  y-axis Low Impact --> High Impact
  quadrant-1 Do First
  quadrant-2 Schedule
  quadrant-3 Delegate
  quadrant-4 Delete
  Feature A: [0.3, 0.8]
  Feature B: [0.7, 0.9]
  Feature C: [0.8, 0.2]
```

## Git Graph

```mermaid
gitGraph
  commit id:"a1"
  branch develop
  checkout develop
  commit id:"b1"
  commit id:"b2"
  checkout main
  merge develop
  commit id:"a2"
```

## Sankey

```mermaid
sankey-beta
  Traffic,Landing,50
  Traffic,Blog,30
  Landing,Signup,20
  Blog,Signup,10
```

## Requirement Diagram

```mermaid
requirementDiagram
  requirement login {
    id: 1
    text: user must authenticate
    risk: high
    verifymethod: test
  }
  functionalRequirement password {
    id: 2
    text: min 8 chars
    risk: medium
    verifymethod: test
  }
  login - contains -> password
```

## C4 Context

```mermaid
C4Context
  Person(user, "User", "Editor user")
  System(app, "Tengwar", "Markdown editor")
  SystemDb(db, "Notes DB", "Stores notes")
  Rel(user, app, "uses")
  Rel(app, db, "reads/writes")
```

## XY Chart

```mermaid
xychart-beta
  title "Sales by quarter"
  x-axis [Q1, Q2, Q3, Q4]
  y-axis "Revenue" 0 --> 100
  bar [30, 60, 45, 80]
  line [25, 55, 50, 90]
```

## Kanban

```mermaid
kanban
  Todo
    Write docs
    Fix bug
  In Progress
    Refactor parser
  Done
    Setup CI
```

## Block Diagram

```mermaid
block-beta
  columns 3
  a["Frontend"] b["API"] c["Database"]
  d["Cache"] e["Queue"] f["Worker"]
```

## Packet Diagram

```mermaid
packet-beta
  title TCP Header
  0-15: "Source Port"
  16-31: "Destination Port"
  32-63: "Sequence Number"
```

---

## Tips

- **Diagram download** — hover over any diagram to reveal **SVG** / **PNG** buttons
- **Zoom** — use **− 100% + Fit** in the toolbar
- **Vim commands** — press `:` in normal mode: `:w`, `:e file.md`, `:s/old/new/g`, `:42`
- **Git** — set a token with the 🔑 button to enable push/pull