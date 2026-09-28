"""Renderiza a sequência da narrativa no Blender (Cycles), em modo headless.

Lê o que blender/export.mjs gerou (malhas, matrizes por frame, câmeras) e monta a cena:
material ABS (clearcoat + subsurface), chão de estúdio, luz-chave, névoa atmosférica no
shader e profundidade de campo. Cada frame é renderizado e salvo em PNG.

Uso (Blender como módulo Python, `pip install bpy`):
  python blender/render.py -- --variant desktop --frames 0:240:1 --res 1440x900 --samples 48
  python blender/render.py -- --variant desktop --mode lit --frames 0:28:1   (lanterna)
  python blender/render.py -- --variant desktop --still 239 --out plate.png  (plate do buquê)
Também funciona com: blender -b -P blender/render.py -- ...
"""
import argparse
import json
import math
import os
import struct
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--variant", default="desktop", choices=["desktop", "mobile"])
ap.add_argument("--mode", default="main", choices=["main", "lit", "turn"])
ap.add_argument("--frames", default="0:240:1")
ap.add_argument("--res", default="1440x900")
ap.add_argument("--samples", type=int, default=48)
ap.add_argument("--out", default=os.path.join(HERE, "renders"))
ap.add_argument("--still", type=int, default=None)
ap.add_argument("--threads", type=int, default=0)
ap.add_argument("--no-blur", action="store_true", help="desliga o motion blur")
args = ap.parse_args(argv)

W, H = map(int, args.res.split("x"))
scene_data = json.load(open(os.path.join(BUILD, "scene.json")))
NF = scene_data["frames"]
objs_meta = scene_data["objects"]
NO = len(objs_meta)
xforms = np.memmap(os.path.join(BUILD, "xforms.bin"), dtype=np.float32, mode="r").reshape(NF, NO, 4, 4)
# poses um pouco antes/depois de cada frame → motion blur (peças e câmera)
_prev = os.path.join(BUILD, "xforms_prev.bin")
HAS_BLUR = os.path.exists(_prev) and not args.no_blur and args.mode != "turn"
if HAS_BLUR:
    xprev = np.memmap(_prev, dtype=np.float32, mode="r").reshape(NF, NO, 4, 4)
    xnext = np.memmap(os.path.join(BUILD, "xforms_next.bin"), dtype=np.float32, mode="r").reshape(NF, NO, 4, 4)
TURN = scene_data["turn"]
turn_x = np.memmap(os.path.join(BUILD, "turn.bin"), dtype=np.float32, mode="r").reshape(TURN["frames"], len(TURN["ids"]), 4, 4)


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


DARK = srgb("#0c0b0a")
CREAM = srgb("#F2E9DA")
FLOOR = srgb("#efe6d6")
lerp = lambda a, b, t: a + (b - a) * t
mix3 = lambda a, b, t: [lerp(x, y, t) for x, y in zip(a, b)]

# ------------------------------------------------------------------ cena
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection

# malhas por tipo
meshes = {}


def load_mesh(name):
    if name in meshes:
        return meshes[name]
    raw = open(os.path.join(BUILD, "geo", name + ".bin"), "rb").read()
    nv, ni = struct.unpack_from("<II", raw, 0)
    off = 8
    pos = np.frombuffer(raw, np.float32, nv * 3, off)
    off += nv * 12
    nor = np.frombuffer(raw, np.float32, nv * 3, off).reshape(-1, 3)
    off += nv * 12
    idx = np.frombuffer(raw, np.uint32, ni, off).astype(np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(nv)
    me.vertices.foreach_set("co", pos)
    me.loops.add(ni)
    me.loops.foreach_set("vertex_index", idx)
    nt = ni // 3
    me.polygons.add(nt)
    me.polygons.foreach_set("loop_start", np.arange(0, ni, 3, dtype=np.int32))
    me.update()
    me.polygons.foreach_set("use_smooth", np.ones(nt, dtype=bool))
    me.normals_split_custom_set_from_vertices([tuple(n) for n in nor])
    me.materials.append(abs_mat)
    meshes[name] = me
    return me


def fog_mix(nt, shader_out, out_node):
    """Mistura o shader com a cor do fundo pela distância da câmera (névoa barata)."""
    cam = nt.nodes.new("ShaderNodeCameraData")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.name = "fogrange"
    mr.inputs["From Min"].default_value = 60
    mr.inputs["From Max"].default_value = 170
    mr.interpolation_type = "SMOOTHSTEP"
    em = nt.nodes.new("ShaderNodeEmission")
    em.name = "fogcolor"
    mx = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(cam.outputs["View Distance"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], mx.inputs["Fac"])
    nt.links.new(shader_out, mx.inputs[1])
    nt.links.new(em.outputs["Emission"], mx.inputs[2])
    nt.links.new(mx.outputs["Shader"], out_node.inputs["Surface"])


# material ABS: cor por objeto (Object Info), clearcoat, subsurface leve
abs_mat = bpy.data.materials.new("ABS")
abs_mat.use_nodes = True
nt = abs_mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
info = nt.nodes.new("ShaderNodeObjectInfo")
nt.links.new(info.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(info.outputs["Color"], bsdf.inputs["Subsurface Radius"])
bsdf.inputs["Roughness"].default_value = 0.26
bsdf.inputs["Coat Weight"].default_value = 0.7
bsdf.inputs["Coat Roughness"].default_value = 0.08
bsdf.inputs["Subsurface Weight"].default_value = float(os.environ.get("SSS", "0"))
bsdf.inputs["Subsurface Scale"].default_value = 0.12
bsdf.inputs["Sheen Weight"].default_value = 0.08
bsdf.inputs["Specular IOR Level"].default_value = 0.55
fog_mix(nt, bsdf.outputs["BSDF"], nt.nodes["Material Output"])

# chão de estúdio
floor_mat = bpy.data.materials.new("Floor")
floor_mat.use_nodes = True
fnt = floor_mat.node_tree
fb = fnt.nodes["Principled BSDF"]
fb.inputs["Roughness"].default_value = 0.85
fb.inputs["Specular IOR Level"].default_value = 0.2
fog_mix(fnt, fb.outputs["BSDF"], fnt.nodes["Material Output"])
bpy.ops.mesh.primitive_plane_add(size=1200, location=(0, 60, -0.002))
floor = bpy.context.active_object
floor.data.materials.append(floor_mat)

# objetos (instâncias que compartilham malha)
t0 = time.time()
objects = []
for i, m in enumerate(objs_meta):
    ob = bpy.data.objects.new(f"o{i}", load_mesh(m["mesh"]))
    ob.color = (*m["color"], 1.0)
    coll.objects.link(ob)
    objects.append(ob)
print(f"cena: {NO} objetos em {time.time() - t0:.1f}s")

# mundo
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
wnt = world.node_tree
bg = wnt.nodes["Background"]
# a câmera vê o fundo com força 1 (igual à cor da névoa); a iluminação usa `Strength`
bg_cam = wnt.nodes.new("ShaderNodeBackground")
lp = wnt.nodes.new("ShaderNodeLightPath")
wmix = wnt.nodes.new("ShaderNodeMixShader")
wnt.links.new(lp.outputs["Is Camera Ray"], wmix.inputs["Fac"])
wnt.links.new(bg.outputs["Background"], wmix.inputs[1])
wnt.links.new(bg_cam.outputs["Background"], wmix.inputs[2])
wnt.links.new(wmix.outputs["Shader"], wnt.nodes["World Output"].inputs["Surface"])

# luzes: sol-chave suave, contraluz, e a "lanterna" (modo lit, só no escuro)
def sun(name, direction, angle, color):
    ld = bpy.data.lights.new(name, "SUN")
    ld.angle = math.radians(angle)
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    coll.objects.link(ob)
    ob.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
    return ld


def y2z(x, y, z):  # three (Y-up) → Blender (Z-up)
    return (x, -z, y)


key = sun("key", Vector(y2z(-14, -30, -12)).normalized(), 4, (1.0, 0.95, 0.88))
rim = sun("rim", Vector(y2z(6, -10, 16)).normalized(), 15, (0.92, 0.96, 1.0))

torch_d = bpy.data.lights.new("torch", "AREA")
torch_d.shape = "DISK"
torch_d.size = 18
torch_d.color = (1.0, 0.88, 0.76)
torch = bpy.data.objects.new("torch", torch_d)
coll.objects.link(torch)

# estufa: treliça invisível à câmera que só projeta sombra — linhas de caixilho sobre o jardim
glass = []


def bar(loc, dims):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.scale = dims
    ob.visible_camera = False
    ob.visible_diffuse = False
    ob.visible_glossy = False
    ob.visible_transmission = False
    ob.visible_volume_scatter = False
    ob.visible_shadow = True
    glass.append(ob)


GH_Y, GH_Z0, GH_Z1 = 34, 30, -128  # altura e extensão (coordenadas three: y, z)
for X in (-24, -8, 8, 24):
    bar(y2z(X, GH_Y, (GH_Z0 + GH_Z1) / 2), (1.1, GH_Z0 - GH_Z1, 1.1))
z = GH_Z0
while z >= GH_Z1:
    bar(y2z(0, GH_Y, z), (80, 1.1, 1.1))
    z -= 14

cam_d = bpy.data.cameras.new("cam")
cam_d.sensor_fit = "VERTICAL"
cam_d.sensor_height = 24
cam_d.clip_start = 0.5
cam_d.clip_end = 1000
cam_d.dof.use_dof = True
cam = bpy.data.objects.new("cam", cam_d)
coll.objects.link(cam)
scene.camera = cam

# ------------------------------------------------------------------ render
scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "CPU"
cy.samples = args.samples
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.04
cy.use_denoising = True
cy.denoiser = "OPENIMAGEDENOISE"
cy.max_bounces = 4
cy.diffuse_bounces = 2
cy.glossy_bounces = 2
cy.transmission_bounces = 2
cy.transparent_max_bounces = 2
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.sample_clamp_indirect = 8
cy.use_light_tree = False
if os.environ.get("FASTGI", "1") == "1":
    cy.use_fast_gi = True
    cy.fast_gi_method = "REPLACE"
    cy.ao_bounces_render = 1
    world.light_settings.distance = 12
scene.render.use_persistent_data = True
# obturador cobre as poses antes/depois (quadros 1→3, centrado no 2)
scene.render.use_motion_blur = HAS_BLUR
scene.render.motion_blur_shutter = 2.0
scene.render.motion_blur_position = "CENTER"
if args.threads:
    scene.render.threads_mode = "FIXED"
    scene.render.threads = args.threads
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.compression = 15
try:
    scene.view_settings.view_transform = "Khronos PBR Neutral"
except TypeError:
    scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0


turn_ids = set(TURN["ids"])
ped_ids = set(TURN["pedestal"])


def set_turn(k):
    """Buquê girado (ângulo k) sobre fundo transparente; chão e pedestal só recebem sombra."""
    last = NF - 1
    fd = set_frame(last)
    X = turn_x[k]
    for i, oid in enumerate(TURN["ids"]):
        ob = objects[oid]
        ob.hide_render = False
        ob.matrix_world = Matrix(X[i].tolist())
    for i, ob in enumerate(objects):
        if i in turn_ids:
            continue
        if i in ped_ids:
            ob.hide_render = False
            ob.is_shadow_catcher = True
            # também catcher e projetando sombra: o catcher registra só a sombra EXTRA do buquê
            # (onde o pedestal já sombreia o chão no plate, não escurece de novo)
            ob.visible_shadow = True
        else:
            ob.hide_render = True
    floor.is_shadow_catcher = True
    for g in glass:
        g.hide_render = True
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    x0, y0, x1, y1 = TURN["crop"][args.variant]
    rw, rh = TURN["res"][args.variant]
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    scene.render.border_min_x = x0 / rw
    scene.render.border_max_x = x1 / rw
    scene.render.border_min_y = 1 - y1 / rh
    scene.render.border_max_y = 1 - y0 / rh
    return fd


animated = set()


def key3(ob, mats):
    """Anima o objeto em 3 quadros (antes, agora, depois): o Cycles borra o movimento entre eles."""
    ob.animation_data_clear()
    ob.rotation_mode = "QUATERNION"
    qprev = None
    for fr, M in zip((1, 2, 3), mats):
        loc, q, sc = Matrix(M).decompose()
        if qprev is not None and qprev.dot(q) < 0:
            q.negate()  # mesmo hemisfério: evita giro de 360° no borrão
        qprev = q
        ob.location, ob.rotation_quaternion, ob.scale = loc, q, sc
        ob.keyframe_insert("location", frame=fr)
        ob.keyframe_insert("rotation_quaternion", frame=fr)
        ob.keyframe_insert("scale", frame=fr)
    animated.add(ob)


def still(ob, M):
    if ob in animated:
        ob.animation_data_clear()
        ob.rotation_mode = "XYZ"
        animated.discard(ob)
    ob.matrix_world = Matrix(M)


def set_frame(f):
    fd = scene_data["frameData"][f]
    light = fd["light"]
    X = xforms[f]
    c = fd["cam"][args.variant]
    CM = np.array(c["m"], dtype=np.float32).reshape(4, 4)
    if HAS_BLUR and "mPrev" in c:
        key3(cam, [np.array(c["mPrev"]).reshape(4, 4).tolist(), CM.tolist(), np.array(c["mNext"]).reshape(4, 4).tolist()])
    else:
        still(cam, CM.tolist())
    # culling: fora da névoa ou bem atrás da câmera não entra na cena
    cp = CM[:3, 3]
    fwd = -CM[:3, 2]
    pos = X[:, :3, 3]
    rel = pos - cp
    dist = np.linalg.norm(rel, axis=1)
    ahead = (rel @ fwd) > -18
    keep = (dist < 210) & (ahead | (dist < 22))
    for i, ob in enumerate(objects):
        m = X[i]
        if math.isnan(m[0, 0]) or not keep[i]:
            ob.hide_render = True
            continue
        ob.hide_render = False
        if HAS_BLUR:
            a, b = xprev[f, i], xnext[f, i]
            if not (math.isnan(a[0, 0]) or math.isnan(b[0, 0])) and np.abs(a - b).max() > 1e-4:
                key3(ob, [a.tolist(), m.tolist(), b.tolist()])
                continue
        still(ob, m.tolist())
    if HAS_BLUR:
        scene.frame_set(2)  # avalia as chaves: pose "agora" no centro do obturador

    cam_d.lens = 12 / math.tan(math.radians(c["fov"]) / 2)
    cam_d.dof.focus_distance = c["focus"]
    # mais desfoque nos closes, quase nada no jardim aberto
    cam_d.dof.aperture_fstop = lerp(0.14, 0.7, fd["garden"])

    bgc = mix3(DARK, CREAM, light)
    bg.inputs["Color"].default_value = (*bgc, 1)
    bg.inputs["Strength"].default_value = lerp(0.02, 0.6, light)
    bg_cam.inputs["Color"].default_value = (*bgc, 1)
    bg_cam.inputs["Strength"].default_value = 1.0
    fb.inputs["Base Color"].default_value = (*mix3(DARK, FLOOR, light), 1)
    for mat in (abs_mat, floor_mat):
        n = mat.node_tree.nodes
        n["fogcolor"].inputs["Color"].default_value = (*bgc, 1)
        n["fogrange"].inputs["From Min"].default_value = lerp(80, 55, fd["garden"])
        n["fogrange"].inputs["From Max"].default_value = lerp(200, 160, fd["garden"])
    key.energy = lerp(0.0, 6.2, light)
    rim.energy = lerp(0.9, 1.2, light)

    # lanterna: no modo lit ilumina as peças soltas pela frente
    lit = args.mode == "lit"
    torch.hide_render = not lit
    for g in glass:
        g.hide_render = light < 0.02
    if lit:
        cp = cam.matrix_world.translation
        fwd = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        torch.location = cp + Vector((4, 0, 6)) + fwd * 2
        torch.rotation_euler = (fwd).to_track_quat("-Z", "Y").to_euler()
        torch_d.energy = 26000 * (1 - light)
    return fd


os.makedirs(args.out, exist_ok=True)
if args.still is not None:
    frames = [args.still]
else:
    a, b, s = (list(map(int, args.frames.split(":"))) + [1])[:3]
    frames = list(range(a, min(b, TURN["frames"] if args.mode == "turn" else NF), s))

prefix = f"{args.variant}_{args.mode}"
for f in frames:
    path = os.path.join(args.out, f"{prefix}_{f:04d}.png")
    if args.still is None and os.path.exists(path):
        continue
    t = time.time()
    set_turn(f) if args.mode == "turn" else set_frame(f)
    t_set = time.time() - t
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"frame {f} ({prefix}) {time.time() - t:.1f}s (cena {t_set:.2f}s)", flush=True)
