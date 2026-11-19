# Genera la skin por defecto (original de Kopi) y los iconos de la app.
import sys
from PIL import Image, ImageDraw

def box(img, u, v, w, h, d, colors):
    """colors: dict face->color or callable(draw, x, y, w, h)"""
    dr = ImageDraw.Draw(img)
    faces = {
        'top': (u+d, v, w, d), 'bottom': (u+d+w, v, w, d),
        'right': (u, v+d, d, h), 'front': (u+d, v+d, w, h),
        'left': (u+d+w, v+d, d, h), 'back': (u+d+w+d, v+d, w, h)}
    for name, (x, y, fw, fh) in faces.items():
        c = colors.get(name, colors.get('all'))
        if callable(c): c(dr, x, y, fw, fh)
        elif c: dr.rectangle([x, y, x+fw-1, y+fh-1], fill=c)

def make_skin(path, hoodie=(24,24,30,255), accent=(139,92,246,255), hair=(28,22,20,255), skin=(214,170,140,255), pants=(40,42,52,255), shoes=(230,230,235,255), eyes=(90,140,230,255)):
    img = Image.new('RGBA', (64, 64), (0,0,0,0))
    def head_front(dr, x, y, w, h):
        dr.rectangle([x, y, x+w-1, y+h-1], fill=skin)
        dr.rectangle([x, y, x+w-1, y+1], fill=hair)
        dr.rectangle([x, y+2, x, y+3], fill=hair); dr.rectangle([x+w-1, y+2, x+w-1, y+3], fill=hair)
        dr.rectangle([x+1, y+4, x+2, y+4], fill=(255,255,255,255)); dr.point((x+2, y+4), fill=eyes)
        dr.rectangle([x+5, y+4, x+6, y+4], fill=(255,255,255,255)); dr.point((x+5, y+4), fill=eyes)
        dr.rectangle([x+3, y+6, x+4, y+6], fill=(170,110,95,255))
    def head_side(dr, x, y, w, h):
        dr.rectangle([x, y, x+w-1, y+h-1], fill=skin); dr.rectangle([x, y, x+w-1, y+2], fill=hair)
    box(img, 0, 0, 8, 8, 8, {'front': head_front, 'right': head_side, 'left': head_side,
                              'back': hair, 'top': hair, 'bottom': skin})
    def body_front(dr, x, y, w, h):
        dr.rectangle([x, y, x+w-1, y+h-1], fill=hoodie)
        dr.rectangle([x+3, y, x+4, y+1], fill=skin)
        dr.line([x+2, y+4, x+5, y+4], fill=accent); dr.line([x+2, y+5, x+5, y+5], fill=accent)
        dr.rectangle([x+1, y+8, x+6, y+9], fill=(32,32,40,255))
    box(img, 16, 16, 8, 12, 4, {'front': body_front, 'all': hoodie})
    def arm(dr, x, y, w, h):
        dr.rectangle([x, y, x+w-1, y+h-1], fill=hoodie)
        dr.rectangle([x, y+h-3, x+w-1, y+h-3], fill=accent)
        dr.rectangle([x, y+h-2, x+w-1, y+h-1], fill=skin)
    box(img, 40, 16, 4, 12, 4, {'all': arm, 'top': hoodie, 'bottom': skin})
    box(img, 32, 48, 4, 12, 4, {'all': arm, 'top': hoodie, 'bottom': skin})
    def leg(dr, x, y, w, h):
        dr.rectangle([x, y, x+w-1, y+h-1], fill=pants)
        dr.rectangle([x, y+h-2, x+w-1, y+h-1], fill=shoes)
    box(img, 0, 16, 4, 12, 4, {'all': leg, 'top': pants, 'bottom': shoes})
    box(img, 16, 48, 4, 12, 4, {'all': leg, 'top': pants, 'bottom': shoes})
    img.save(path)

def make_icon(path, size=1024):
    s = size
    img = Image.new('RGBA', (s, s), (0,0,0,0))
    dr = ImageDraw.Draw(img)
    r = int(s*0.22)
    dr.rounded_rectangle([0, 0, s-1, s-1], radius=r, fill=(8,8,10,255), outline=(46,46,54,255), width=max(2, s//128))
    import math
    cx, cy, R = s/2, s/2, s*0.33
    pts = [(cx + R*math.sin(math.radians(a)), cy - R*math.cos(math.radians(a))) for a in range(0, 360, 60)]
    w = max(3, int(s*0.035))
    dr.line(pts + [pts[0]], fill=(245,245,247,255), width=w, joint='curve')
    inner = int(R*0.42)
    dr.rectangle([cx-inner*0.6, cy-inner*0.48, cx+inner*0.6, cy+inner*0.48], outline=(245,245,247,255), width=int(w*0.85))
    thin = max(2, int(w*0.55))
    for i, p in enumerate(pts):
        corner = (cx + (inner*0.6 if p[0] > cx+1 else -inner*0.6 if p[0] < cx-1 else 0),
                  cy + (inner*0.48 if p[1] > cy else -inner*0.48))
        dr.line([p, corner], fill=(160,160,170,255), width=thin)
    img.save(path)

if __name__ == '__main__':
    make_skin('src/renderer/assets/default-skin.png')
    make_skin('test/fixtures/skin-alt.png', hoodie=(235,235,240,255), accent=(40,90,200,255), hair=(90,60,40,255), pants=(30,30,36,255), shoes=(30,30,30,255), eyes=(60,160,90,255))
    make_icon('build/icon.png', 1024)
    make_icon('src/renderer/assets/icon.png', 256)
    print('ok')
