# ТЗ на маскота U.N.A. — Leonardo.ai + Rive

## 1. Leonardo.ai — генерация спрайта персонажа

### Промпт (вставь в Leonardo AI, Model: Leonardo Kino XL)
```
character design sheet, cute friendly AI assistant mascot, glowing purple-teal color scheme, round smooth body like a friendly blob/spirit, big expressive eyes, no mouth, floating, minimalistic, clean vector style, 4 views (front side back 3/4), transparent background, soft glowing aura, digital art, high quality, character sheet reference
```

### Negative prompt
```
ugly, deformed, scary, realistic, human, animal, complex details, heavy shading, dark, messy, noisy, text, watermark
```

### Что делать после генерации:
1. Выбери лучший вариант (передний вид, симметричный)
2. Загрузи в **Vectorizer.ai** (бесплатно) — переведи в SVG
3. Или обведи в Adobe Illustrator / Inkscape (бесплатно) в вектор
4. Сохрани как SVG — понадобится для Rive

### Альтернатива: Midjourney (если есть)
```
friendly AI mascot character design, glowing purple and cyan, cute round blob with big eyes, minimal vector style, white background, 2d --ar 3:4 --style expressive --v 6.1
```

---

## 2. Rive Editor — создание анимации

### Файл: `una-mascot.riv`
Положи в `UNA-Desktop-v36/public/una-mascot.riv`

### State Machine: "State Machine 1"

#### Inputs (создать в Rive Editor):

| Input Name | Type | Values | Назначение |
|-----------|------|--------|------------|
| `status` | Text | idle, thinking, speaking, listening, working | Режим работы |
| `emotion` | Text | neutral, happy, sad, angry, excited, worried, thinking | Эмоция |

#### Анимации (Artboard: "Mascot"):

| Animation Name | Что делает | Loop |
|---------------|-----------|------|
| `idle` | Легкое покачивание + моргание каждые 3-5 сек | yes |
| `thinking` | Глаза смотрят вверх, точки над головой | yes |
| `speaking` | Рот открывается/закрывается, волны звука | yes |
| `listening` | Уши/антенны направлены вперёд | yes |
| `working` | Быстрые частицы, энергичное состояние | yes |

#### Transition rules (в State Machine):

```
status == "idle"    → проигрывать idle (loop)
status == "thinking" → blend в thinking (0.3s transition)
status == "speaking" → blend в speaking (0.2s)
status == "listening" → blend в listening (0.3s)
status == "working"  → blend в working (0.3s)

emotion == "happy"   → глаза в дугу ^_^
emotion == "sad"     → глаза вниз, капля
emotion == "angry"   -> прищур, красный оттенок
emotion == "excited" → звёзды в глазах
emotion == "worried" → дрожание, глаза в стороны
emotion == "thinking" → прищур одного глаза
```

### Как сделать в Rive Editor:
1. Создай новый файл, выбери **"Empty"**
2. Artboard: 200x200px
3. Импортируй SVG персонажа (из Leonardo)
4. Создай Bone (кость) для тела, головы, глаз
5. Анимируй каждое состояние как отдельную animation timeline
6. Переключись на вкладку **State Machine**
7. Создай два Text input: `status`, `emotion`
8. Для каждого значения status → link на соответствующую анимацию
9. Export → Rive → `una-mascot.riv`

### Тестирование в браузере:
После того как положишь файл в `public/`:
1. Открой настройки UNA → секция "Маскот"
2. Переключи тумблер на Rive 3D
3. Если .riv файл есть — он подхватится автоматически

---

## 3. Если хочешь быстро проверить без кастомного .riv

Есть готовый Rive-файл робота-компаньона от Rive Community:
https://rive.app/community/ — скачай любой `.riv` с похожим State Machine
Переименуй в `una-mascot.riv` и кинь в `public/` — сразу увидишь как работает интеграция.
