"""Build "AIDV Fraktur" (used by the hero headline): Pirata One (SIL OFL 1.1) + constructed Cyrillic/Kazakh lowercase.
Usage: pip install fonttools brotli skia-pathops; python3 fonts/build-aidv-fraktur.py PirataOne-Regular.ttf fonts/aidv-fraktur.woff2
Then inline the woff2 as base64 in the @font-face in index.html. Add any new letters to `text` at the bottom."""
import sys
import pathops
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen

SRC, OUT = sys.argv[1], sys.argv[2]
f = TTFont(SRC)
gs = f.getGlyphSet()
XH = 570

def P(name, xx=1, yy=1, dx=0, dy=0, skx=0):
    p = pathops.Path()
    gs[name].draw(TransformPen(p.getPen(), (xx, 0, skx, yy, dx, dy)))
    return p

def poly(*pts):
    p = pathops.Path(); pen = p.getPen()
    pen.moveTo(pts[0])
    for q in pts[1:]: pen.lineTo(q)
    pen.closePath(); return p

def rect(x0, y0, x1, y1): return poly((x0, y0), (x1, y0), (x1, y1), (x0, y1))

def U(*ps):
    r = pathops.Path()
    for p in ps: r = pathops.op(r, p, pathops.PathOp.UNION)
    return r

def I(a, b): return pathops.op(a, b, pathops.PathOp.INTERSECTION)
def D(a, b): return pathops.op(a, b, pathops.PathOp.DIFFERENCE)

def stem(dx=0): return P('dotlessi', dx=dx - 0)  # stem body x 50..170
# a "bare" vertical stem segment with blackletter cut ends, x0..x0+120
def bar_stem(x0, y0=0, y1=XH): return rect(x0, y0 + 40, x0 + 120, y1 - 40)

glyf, hmtx, order = f['glyf'], f['hmtx'], f.getGlyphOrder()
new = {}

def add(uni, name, path, width):
    pen = TTGlyphPen(None)
    path.draw(Cu2QuPen(pen, max_err=1, reverse_direction=False))
    g = pen.glyph()
    g.recalcBounds(glyf)
    glyf[name] = g
    if name not in order: order.append(name)
    hmtx[name] = (width, g.xMin if g.numberOfContours else 0)
    new[uni] = name

def alias(uni, name): new[uni] = name

# straight Latin look-alikes
for c, n in {'а':'a','е':'e','о':'o','с':'c','р':'p','у':'y','х':'x','п':'n',
             'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X'}.items():
    alias(ord(c), n)
alias(ord('и'), 'u')
alias(ord('й'), 'ubreve')

# И: two cap-height stems joined by a rising hairline
CH = 793 / 570
I_ = U(P('dotlessi', yy=CH), P('dotlessi', yy=CH, dx=250), poly((150, 90), (200, 90), (330, 700), (280, 700)))
add(ord('И'), 'uni0418', I_, 470)

# н: two stems + slanted crossbar
n_ = U(P('dotlessi'), P('dotlessi', dx=210), poly((150, 250), (290, 290), (290, 350), (150, 310)))
add(ord('н'), 'uni043D', n_, 430)

# т: stem centred under a top bar (small-cap T)
t_ = U(P('dotlessi', dx=105), poly((10, 470), (60, 530), (420, 530), (370, 470)),
       poly((10, 470), (60, 530), (0, 560)), poly((370, 470), (420, 530), (440, 450)))
add(ord('т'), 'uni0442', t_, 430)

# ь: stem + a low bowl on the right
def low_bowl(y0, h, w=0.95):
    o = P('o', xx=w, yy=h / XH, dx=60, dy=y0)
    return D(o, rect(-50, -50, 150, 900))
soft = U(P('dotlessi'), low_bowl(0, 330))
add(ord('ь'), 'uni044C', soft, 430)

# ы: ь + i
add(ord('ы'), 'uni044B', U(soft, P('dotlessi', dx=400)), 620)

# в: stem + two stacked bowls
v_ = U(P('dotlessi'), low_bowl(0, 330), low_bowl(270, 300, 0.85))
add(ord('в'), 'uni0432', v_, 430)

# ю: i + bar + o
yu = U(P('dotlessi'), poly((150, 255), (260, 265), (260, 320), (150, 310)), P('o', dx=180))
add(ord('ю'), 'uni044E', yu, 620)

# я: mirrored, x-height R
R = P('R', xx=-0.95, yy=XH / 768 * 1.0, dx=430)
add(ord('я'), 'uni044F', R, 430)

# л: n with the left stem turned into a hook to the lower left
l_ = U(D(I(P('n'), rect(150, -50, 600, 700)), rect(140, -50, 250, 160)), I(P('dotlessi'), rect(-50, 330, 300, 700)),
       poly((50, 360), (170, 360), (170, 300), (100, 0), (-40, -20), (-30, 30)))
add(ord('л'), 'uni043B', l_, 430)

# д: л-like body on a base bar with two descenders
d_body = D(P('n', dx=20), rect(-50, -50, 600, 120))
d_ = U(d_body, poly((70, 300), (190, 300), (190, 120), (70, 120)),
       rect(-10, 40, 460, 120), poly((-10, 40), (50, 40), (40, -130), (-10, -100)),
       poly((400, 40), (460, 40), (460, -100), (410, -130)))
add(ord('д'), 'uni0434', d_, 460)

# ш: m turned 180°
add(ord('ш'), 'uni0448', P('m', xx=-1, yy=-1, dx=640, dy=XH), 640)

# к / қ: stem + arm + leg
k_ = U(P('dotlessi'), poly((150, 240), (150, 350), (300, 570), (420, 570)),
       poly((150, 330), (250, 330), (430, 40), (440, 0), (330, 0)))
add(ord('к'), 'uni043A', k_, 450)
add(ord('қ'), 'uni049B', U(k_, poly((380, 40), (440, 40), (450, -140), (390, -110))), 460)

# Ғ/ғ and others are not needed by the headline copy.

cmap = f['cmap']
for t in cmap.tables:
    if t.isUnicode():
        t.cmap.update(new)
f.setGlyphOrder(order)
if 'post' in f: f['post'].formatType = 3.0

# rename (Reserved Font Name 'Pirata')
for rec in f['name'].names:
    if rec.nameID in (1, 3, 4, 6, 16, 17):
        s = rec.toUnicode()
        rec.string = s.replace('Pirata One', 'AIDV Fraktur').replace('PirataOne', 'AIDVFraktur').replace('Pirata', 'AIDV Fraktur')

# keep only what the hero needs
from fontTools import subset
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['kern', 'liga']; opts.name_IDs = ['*']
s = subset.Subsetter(opts)
text = "IdeasmaderlИдеистановятсяРеальностьюИдеяларшындыққаайналадыIDEASMADEREAL йнвдлшыяюькқт"
s.populate(text=text)
s.subset(f)
f.flavor = 'woff2'
f.save(OUT)
print('ok', len(new))
