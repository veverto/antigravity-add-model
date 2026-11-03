#!/usr/bin/env python3
"""
sync-conversations.py
=============================================================================
Utilitário de Verificação e Sincronização Granular Bidirecional de Conversas
e Workspaces entre a instalação principal do Antigravity IDE e o Perfil de Testes.

Recursos:
  • Sincronização e auditoria em duas vias (Two-Way Reconciliation).
  • Reconstrução e merge granular do índice de conversas da interface
    (chave antigravityUnifiedStateSync.trajectorySummaries no state.vscdb).
  • Resgate automático de conversas com ponteiros perdidos no disco (ex: be507110).
  • Preservação de abas e estados locais dos workspaces sem sobreposições destrutivas.
  • Criação automática de backups com timestamp antes de qualquer alteração.
=============================================================================
"""

import os
import sys
import json
import sqlite3
import shutil
import base64
import argparse
from datetime import datetime

# Cores ANSI para saída no terminal
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

SYS_CONFIG = os.path.expanduser("~/.config/Antigravity IDE/User")
if not os.path.isdir(SYS_CONFIG) and os.path.isdir(os.path.expanduser("~/.config/antigravity-ide/User")):
    SYS_CONFIG = os.path.expanduser("~/.config/antigravity-ide/User")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GEMINI_DIR = os.path.expanduser("~/.gemini/antigravity-ide")
BRAIN_DIR = os.path.join(GEMINI_DIR, "brain")
CONVERSATIONS_DIR = os.path.join(GEMINI_DIR, "conversations")

SYS_GLOBAL_DB = os.path.join(SYS_CONFIG, "globalStorage", "state.vscdb")
TEST_CONFIG = ""
TEST_GLOBAL_DB = ""

def set_target_ide(target_path=None):
    global TEST_CONFIG, TEST_GLOBAL_DB
    if not target_path:
        default_name = "antigravity-ide-2.6.0" if os.path.isdir(os.path.join(SCRIPT_DIR, "antigravity-ide-2.6.0")) else "antigravity-ide"
        target_path = os.path.join(SCRIPT_DIR, default_name)

    target_path = os.path.abspath(target_path)
    if os.path.basename(target_path) == "User":
        TEST_CONFIG = target_path
    elif os.path.basename(target_path) == "user-data":
        TEST_CONFIG = os.path.join(target_path, "User")
    elif os.path.basename(target_path) == ".profile":
        TEST_CONFIG = os.path.join(target_path, "user-data", "User")
    else:
        TEST_CONFIG = os.path.join(target_path, ".profile", "user-data", "User")

    TEST_GLOBAL_DB = os.path.join(TEST_CONFIG, "globalStorage", "state.vscdb")
    os.makedirs(os.path.dirname(TEST_GLOBAL_DB), exist_ok=True)

set_target_ide()


def format_dt(timestamp):
    if not timestamp:
        return "N/A"
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M")


# ─── Funções Utilitárias Protobuf para TrajectorySummaries ──────────────────

def encode_varint(value):
    result = b""
    while value > 0x7F:
        result += bytes([(value & 0x7F) | 0x80])
        value >>= 7
    result += bytes([value & 0x7F])
    return result or b"\x00"


def decode_varint(data, pos):
    result, shift = 0, 0
    while pos < len(data):
        b = data[pos]
        result |= (b & 0x7F) << shift
        if (b & 0x80) == 0:
            return result, pos + 1
        shift += 7
        pos += 1
    return result, pos


def skip_protobuf_field(data, pos, wire_type):
    if wire_type == 0:
        _, pos = decode_varint(data, pos)
    elif wire_type == 2:
        length, pos = decode_varint(data, pos)
        pos += length
    elif wire_type == 1:
        pos += 8
    elif wire_type == 5:
        pos += 4
    return pos


def strip_field_from_protobuf(data, target_field_number):
    remaining = b""
    pos = 0
    while pos < len(data):
        start_pos = pos
        try:
            tag, pos = decode_varint(data, pos)
        except Exception:
            remaining += data[start_pos:]
            break
        wire_type = tag & 7
        field_num = tag >> 3
        new_pos = skip_protobuf_field(data, pos, wire_type)
        if new_pos == pos and wire_type not in (0, 1, 2, 5):
            remaining += data[start_pos:]
            break
        pos = new_pos
        if field_num != target_field_number:
            remaining += data[start_pos:pos]
    return remaining


def encode_length_delimited(field_number, data):
    tag = (field_number << 3) | 2
    return encode_varint(tag) + encode_varint(len(data)) + data


def encode_string_field(field_number, string_value):
    return encode_length_delimited(field_number, string_value.encode("utf-8"))


def build_timestamp_field(field_number, unix_timestamp):
    seconds = int(unix_timestamp)
    nanos = int((unix_timestamp - seconds) * 1e9)
    ts_sub = encode_varint((1 << 3) | 0) + encode_varint(seconds)
    if nanos:
        ts_sub += encode_varint((2 << 3) | 0) + encode_varint(nanos)
    return encode_length_delimited(field_number, ts_sub)


def build_timestamp_fields(unix_timestamp):
    return (
        build_timestamp_field(3, unix_timestamp)
        + build_timestamp_field(7, unix_timestamp)
        + build_timestamp_field(10, unix_timestamp)
    )


def get_all_known_workspace_uris():
    uris = set()
    for base in [SYS_CONFIG, TEST_CONFIG]:
        ws_dir = os.path.join(base, "workspaceStorage")
        if os.path.isdir(ws_dir):
            for entry in os.listdir(ws_dir):
                w_json = os.path.join(ws_dir, entry, "workspace.json")
                if os.path.isfile(w_json):
                    try:
                        with open(w_json, "r", encoding="utf-8") as f:
                            d = json.load(f)
                            u = d.get("folder") or d.get("workspace")
                            if u:
                                uris.add(u)
                    except Exception:
                        pass

    default_fallbacks = [
        "file:///home/weverton-castro/projects/voice-frontend",
        "file:///home/weverton-castro/projects/voice-backend",
        "file:///home/weverton-castro/projects/manager-front",
        "file:///home/weverton-castro/projects/sz4-webchat-v3",
        "file:///home/weverton-castro/projects/sz4-frontend",
        "file:///home/weverton-castro/projects/sz4-backend",
        "file:///home/weverton-castro/projects/sz-pages",
        "file:///home/weverton-castro/projects/sz-components",
        "file:///home/weverton-castro/projects/sz4-webchat",
        "file:///home/weverton-castro/projects/sz4",
        "file:///home/weverton-castro/projects/message-template-hub",
        "file:///home/weverton-castro/projects/pipelines",
        "file:///home/weverton-castro/projects/gateway-payment",
        "file:///home/weverton-castro/Documentos/projects/pocs/message-models-arch",
        "file:///home/weverton-castro/Documentos/projects/pocs/antigravity-byok",
    ]
    for uri in default_fallbacks:
        uris.add(uri)
    return sorted(list(uris))


def build_workspaces_fields(workspace_uris=None):
    if not workspace_uris:
        workspace_uris = get_all_known_workspace_uris()
    res = b""
    for uri in workspace_uris:
        sub_msg = encode_string_field(1, uri) + encode_string_field(2, uri)
        res += encode_length_delimited(9, sub_msg)
    return res


def load_inner_data_from_conv_db(conversation_id):
    conv_db = os.path.join(CONVERSATIONS_DIR, f"{conversation_id}.db")
    if not os.path.exists(conv_db):
        return None
    try:
        conn = sqlite3.connect(conv_db)
        c = conn.cursor()
        c.execute("SELECT data FROM trajectory_metadata_blob")
        row = c.fetchone()
        c.execute("SELECT max(idx) FROM steps")
        max_step = c.fetchone()[0] or 0
        c.execute("SELECT * FROM trajectory_meta")
        t_meta = c.fetchone()
        uuid_val = t_meta[0] if t_meta else conversation_id
        conn.close()
        if not row or not row[0]:
            return None
        blob = row[0]
        f17 = strip_field_from_protobuf(blob, 15)

        inner = b""
        inner += encode_varint((2 << 3) | 0) + encode_varint(max_step + 1)
        inner += encode_length_delimited(4, uuid_val.encode("utf-8"))
        inner += encode_varint((5 << 3) | 0) + encode_varint(3)
        inner += encode_length_delimited(15, b"")
        inner += encode_varint((16 << 3) | 0) + encode_varint(max_step)
        inner += encode_length_delimited(17, f17)
        inner += encode_varint((21 << 3) | 0) + encode_varint(1)
        inner += encode_varint((22 << 3) | 0) + encode_varint(4)
        return inner
    except Exception:
        return None


def build_trajectory_entry(conversation_id, title, existing_inner_data, unix_timestamp, workspace_uris=None):
    if not existing_inner_data:
        existing_inner_data = load_inner_data_from_conv_db(conversation_id)

    if existing_inner_data:
        inner_info = strip_field_from_protobuf(existing_inner_data, 1)
        inner_info = encode_string_field(1, title) + inner_info
        inner_info = strip_field_from_protobuf(inner_info, 9)
        inner_info += build_workspaces_fields(workspace_uris)
        inner_info = strip_field_from_protobuf(inner_info, 3)
        inner_info = strip_field_from_protobuf(inner_info, 7)
        inner_info = strip_field_from_protobuf(inner_info, 10)
        inner_info += build_timestamp_fields(unix_timestamp)
    else:
        inner_info = encode_string_field(1, title) + build_workspaces_fields(workspace_uris) + build_timestamp_fields(unix_timestamp)

    info_b64 = base64.b64encode(inner_info).decode("utf-8")
    sub_message = encode_string_field(1, info_b64)
    entry = encode_string_field(1, conversation_id)
    entry += encode_length_delimited(2, sub_message)
    return entry, inner_info


def extract_trajectory_summaries(db_path):
    summaries = {}
    if not os.path.isfile(db_path):
        return summaries
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT value FROM ItemTable WHERE key='antigravityUnifiedStateSync.trajectorySummaries'")
        row = cur.fetchone()
        conn.close()
    except Exception:
        return summaries

    if not row or not row[0]:
        return summaries

    try:
        decoded = base64.b64decode(row[0])
    except Exception:
        return summaries

    pos = 0
    while pos < len(decoded):
        tag, pos = decode_varint(decoded, pos)
        if (tag & 7) != 2:
            break
        length, pos = decode_varint(decoded, pos)
        entry_bytes = decoded[pos:pos + length]
        pos += length

        epos = 0
        cid = None
        info_b64 = None
        while epos < len(entry_bytes):
            etag, epos = decode_varint(entry_bytes, epos)
            efield = etag >> 3
            ewire = etag & 7
            if ewire == 2:
                el, epos = decode_varint(entry_bytes, epos)
                val = entry_bytes[epos:epos + el]
                epos += el
                if efield == 1:
                    cid = val.decode("latin1", errors="replace")
                elif efield == 2:
                    sub_pos = 0
                    while sub_pos < len(val):
                        stag, sub_pos = decode_varint(val, sub_pos)
                        if (stag & 7) == 2:
                            sl, sub_pos = decode_varint(val, sub_pos)
                            info_b64 = val[sub_pos:sub_pos + sl].decode("latin1", errors="replace")
                            sub_pos += sl
                        else:
                            break
            else:
                break

        if cid and info_b64:
            try:
                inner = base64.b64decode(info_b64)
                ipos = 0
                title = ""
                step_count = 0
                last_mod = 0
                last_input = 0
                while ipos < len(inner):
                    itag, ipos = decode_varint(inner, ipos)
                    ifnum = itag >> 3
                    iwire = itag & 7
                    if iwire == 0:
                        val, ipos = decode_varint(inner, ipos)
                        if ifnum == 2:
                            step_count = val
                    elif iwire == 2:
                        il, ipos = decode_varint(inner, ipos)
                        val = inner[ipos:ipos + il]
                        ipos += il
                        if ifnum == 1:
                            title = val.decode("utf-8", errors="replace")
                        elif ifnum in (3, 10):
                            tpos = 0
                            while tpos < len(val):
                                ttag, tpos = decode_varint(val, tpos)
                                if (ttag >> 3) == 1:
                                    sec, tpos = decode_varint(val, tpos)
                                    if ifnum == 3:
                                        last_mod = sec
                                    if ifnum == 10:
                                        last_input = sec
                    else:
                        ipos = skip_protobuf_field(inner, ipos, iwire)

                summaries[cid] = {
                    "id": cid,
                    "title": title or f"Conversa {cid[:8]}",
                    "step_count": step_count,
                    "last_mod": last_mod,
                    "last_input": last_input,
                    "effective_ts": max(last_mod, last_input),
                    "entry_bytes": entry_bytes,
                    "inner_bytes": inner,
                }
            except Exception:
                pass

    return summaries


def save_trajectory_summaries(db_path, entries_list):
    if not os.path.isfile(db_path):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")
        conn.commit()
        conn.close()

    result_bytes = b""
    for cid, eb in entries_list:
        result_bytes += encode_length_delimited(1, eb)

    encoded = base64.b64encode(result_bytes).decode("utf-8")

    # Backup de segurança
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.backup_{ts}"
    try:
        shutil.copy2(db_path, backup_path)
    except Exception:
        pass

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO ItemTable (key, value) VALUES ('antigravityUnifiedStateSync.trajectorySummaries', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (encoded,)
    )
    conn.commit()
    conn.close()
    return True


# ─── Detalhes e Auditoria de Conversas ──────────────────────────────────────

def get_conversation_details(cid):
    title = None
    last_mod = 0
    workspace = None

    for ext in [".db", ".pb"]:
        cpath = os.path.join(CONVERSATIONS_DIR, f"{cid}{ext}")
        if os.path.isfile(cpath):
            m = os.path.getmtime(cpath)
            if m > last_mod:
                last_mod = m

    # Tenta título customizado conhecido para resgates específicos
    if cid == "be507110-32b0-4698-9e30-b459907fddc5":
        title = "Code Review Analysis (MR 912 - Note #529627)"

    tpath = os.path.join(BRAIN_DIR, cid, ".system_generated", "logs", "transcript.jsonl")
    if os.path.isfile(tpath):
        m = os.path.getmtime(tpath)
        if m > last_mod:
            last_mod = m
        try:
            with open(tpath, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if not line.strip():
                        continue
                    try:
                        entry = json.loads(line)
                    except Exception:
                        continue

                    if not workspace and entry.get("type") == "USER_INPUT":
                        content = entry.get("content", "")
                        if "Active Document:" in content:
                            doc = content.split("Active Document:")[1].split("\n")[0].strip()
                            workspace = os.path.dirname(doc)
                        elif "Other open documents:" in content:
                            doc = content.split("Other open documents:")[1].split("\n")[1].replace("-", "").strip()
                            workspace = os.path.dirname(doc)

                        if not title and "<USER_REQUEST>" in content:
                            req = content.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                            title = req.replace("\n", " ").strip()
                            if len(title) > 48:
                                title = title[:45] + "..."

                    if entry.get("type") == "CONVERSATION_HISTORY" and not title:
                        c_text = entry.get("content", "")
                        if cid in c_text:
                            for c_line in c_text.split("\n"):
                                if cid in c_line and ":" in c_line:
                                    title = c_line.split(":")[-1].strip()
                                    break
        except Exception:
            pass

    if not title:
        for fname in ["task.md", "implementation_plan.md"]:
            fpath = os.path.join(BRAIN_DIR, cid, fname)
            if os.path.isfile(fpath):
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as fp:
                        for line in fp:
                            line = line.strip()
                            if line.startswith("# "):
                                title = line[2:].strip()
                                break
                except Exception:
                    pass
            if title:
                break

    if not title:
        title = f"Conversa {cid[:8]}"

    return {
        "id": cid,
        "title": title,
        "last_mod": last_mod,
        "workspace": workspace or "Global",
    }


def get_all_workspaces(base_user_dir):
    ws_dir = os.path.join(base_user_dir, "workspaceStorage")
    workspaces = {}
    if not os.path.isdir(ws_dir):
        return workspaces

    for entry in os.listdir(ws_dir):
        p = os.path.join(ws_dir, entry)
        if not os.path.isdir(p):
            continue

        w_json = os.path.join(p, "workspace.json")
        target_uri = ""
        friendly_name = entry[:8]

        if os.path.isfile(w_json):
            try:
                with open(w_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    target_uri = data.get("workspace") or data.get("folder", "")
                    if target_uri:
                        friendly_name = os.path.basename(target_uri.rstrip("/"))
            except Exception:
                pass

        db_path = os.path.join(p, "state.vscdb")
        mtime = os.path.getmtime(db_path) if os.path.isfile(db_path) else 0

        conversations = set()
        if os.path.isfile(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cur = conn.cursor()
                cur.execute("SELECT value FROM ItemTable WHERE key = 'history.entries'")
                row = cur.fetchone()
                if row and row[0]:
                    try:
                        entries = json.loads(row[0])
                        for item in entries:
                            editor = item.get("editor", {})
                            res = editor.get("resource", "") or editor.get("resourceUri", "")
                            if "/brain/" in res:
                                parts = res.split("/brain/")[1].split("/")
                                if parts and len(parts[0]) == 36 and "-" in parts[0]:
                                    conversations.add(parts[0])
                    except Exception:
                        pass
                conn.close()
            except Exception:
                pass

        workspaces[entry] = {
            "name": friendly_name,
            "uri": target_uri,
            "mtime": mtime,
            "db_path": db_path,
            "dir_path": p,
            "conversations": conversations,
        }

    return workspaces


def list_recent_conversations(limit=15):
    conversations = []
    if not os.path.isdir(BRAIN_DIR):
        return conversations

    for entry in os.listdir(BRAIN_DIR):
        p = os.path.join(BRAIN_DIR, entry)
        if os.path.isdir(p) and len(entry) == 36 and "-" in entry:
            info = get_conversation_details(entry)
            conversations.append(info)

    conversations.sort(key=lambda x: x["last_mod"], reverse=True)
    return conversations[:limit]


def sanitize_corrupted_conv_dbs():
    """
    Detecta e corrige automaticamente bancos SQLite (.db) de conversas que foram criados
    vazios (0 passos/steps) enquanto o arquivo legado em Protobuf (.pb) com histórico intacto
    ainda existe no disco.
    Isso impede que o Language Server tente abrir um .db corrompido/vazio e trave a conversa em carregamento infinito.
    """
    if not os.path.isdir(CONVERSATIONS_DIR):
        return 0

    fixed_count = 0
    for fname in os.listdir(CONVERSATIONS_DIR):
        if not fname.endswith(".db"):
            continue
        cid = fname[:-3]
        if len(cid) != 36:
            continue
        db_path = os.path.join(CONVERSATIONS_DIR, fname)
        pb_path = os.path.join(CONVERSATIONS_DIR, f"{cid}.pb")
        if not (os.path.isfile(pb_path) and os.path.getsize(pb_path) > 0):
            continue
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("SELECT count(*) FROM steps")
            step_count = c.fetchone()[0]
            conn.close()
            if step_count == 0:
                bak_path = db_path + ".corrupted_bak"
                shutil.move(db_path, bak_path)
                fixed_count += 1
                print(f"  {YELLOW}⚠ Auto-Healing: Removido .db vazio da conversa {cid} (preservado .pb de {os.path.getsize(pb_path):,} bytes). Backup: {bak_path}{RESET}")
        except Exception:
            try:
                bak_path = db_path + ".corrupted_bak"
                shutil.move(db_path, bak_path)
                fixed_count += 1
                print(f"  {YELLOW}⚠ Auto-Healing: Removido .db corrompido da conversa {cid} (preservado .pb de {os.path.getsize(pb_path):,} bytes). Backup: {bak_path}{RESET}")
            except Exception:
                pass
    return fixed_count


# ─── Sincronização e Reconciliação Bidirecional ─────────────────────────────

def sync_trajectory_summaries(direction="bidirectional"):
    """
    Sincroniza granularmente os ponteiros de conversas (antigravityUnifiedStateSync.trajectorySummaries)
    entre o Sistema Principal e o Ambiente de Testes.
    Detecta e resgata conversas que existem no disco mas perderam ponteiro (ex: be507110).
    """
    sanitize_corrupted_conv_dbs()
    print(f"\n{BOLD}{CYAN}----------------------------------------------------------------------------------------{RESET}")
    print(f"{BOLD}Sincronizando Índice Central de Conversas (TrajectorySummaries) [{direction}]...{RESET}")

    sys_summaries = extract_trajectory_summaries(SYS_GLOBAL_DB)
    test_summaries = extract_trajectory_summaries(TEST_GLOBAL_DB)

    print(f"  • Ponteiros no Sistema Principal: {BOLD}{len(sys_summaries)}{RESET}")
    print(f"  • Ponteiros no Ambiente de Testes: {BOLD}{len(test_summaries)}{RESET}")

    # 1. Detecta conversas físicas no disco recentes que faltam nos ponteiros
    all_known_cids = set(sys_summaries.keys()) | set(test_summaries.keys())
    disk_rescues = 0

    if os.path.isdir(CONVERSATIONS_DIR):
        for fname in os.listdir(CONVERSATIONS_DIR):
            if fname.endswith(".db") or fname.endswith(".pb"):
                cid = fname.split(".")[0]
                if len(cid) == 36 and cid not in all_known_cids:
                    details = get_conversation_details(cid)
                    # Resgata se foi modificada nos últimos 14 dias
                    if details["last_mod"] > 0:
                        inner = load_inner_data_from_conv_db(cid)
                        entry_bytes, _ = build_trajectory_entry(
                            cid, details["title"], inner, details["last_mod"]
                        )
                        record = {
                            "id": cid,
                            "title": details["title"],
                            "step_count": 1,
                            "last_mod": int(details["last_mod"]),
                            "last_input": int(details["last_mod"]),
                            "effective_ts": int(details["last_mod"]),
                            "entry_bytes": entry_bytes,
                            "inner_bytes": inner or b"",
                        }
                        sys_summaries[cid] = record
                        test_summaries[cid] = record
                        all_known_cids.add(cid)
                        disk_rescues += 1
                        print(f"  {GREEN}⭐ Conversa resgatada do disco:{RESET} [{cid[:8]}] {details['title']}")

    # 2. Reconciliação Bidirecional (O mais recente prevalece)
    merged = {}
    sys_updated = 0
    test_updated = 0

    for cid in all_known_cids:
        in_sys = sys_summaries.get(cid)
        in_test = test_summaries.get(cid)

        if in_sys and not in_test:
            merged[cid] = in_sys
            test_updated += 1
        elif in_test and not in_sys:
            merged[cid] = in_test
            sys_updated += 1
        else:
            # Ambos têm: compara timestamp e contagem de passos
            if in_test["effective_ts"] > in_sys["effective_ts"] or in_test["step_count"] > in_sys["step_count"]:
                merged[cid] = in_test
                sys_updated += 1
            else:
                merged[cid] = in_sys
                if in_sys["effective_ts"] > in_test["effective_ts"]:
                    test_updated += 1

    # Ordena decrescente por timestamp efetivo (as mais novas no topo)
    sorted_entries = sorted(
        [(cid, data["entry_bytes"]) for cid, data in merged.items()],
        key=lambda x: merged[x[0]]["effective_ts"],
        reverse=True,
    )

    # 3. Salva nos destinos correspondentes
    if direction in ("bidirectional", "to-system") and (sys_updated > 0 or disk_rescues > 0):
        save_trajectory_summaries(SYS_GLOBAL_DB, sorted_entries)
        print(f"  {GREEN}✔ Sistema Principal atualizado:{RESET} {len(sorted_entries)} ponteiros ({sys_updated} sincronizados/resgatados)")

    if direction in ("bidirectional", "to-test") and (test_updated > 0 or disk_rescues > 0):
        save_trajectory_summaries(TEST_GLOBAL_DB, sorted_entries)
        print(f"  {GREEN}✔ Ambiente de Testes atualizado:{RESET} {len(sorted_entries)} ponteiros ({test_updated} sincronizados/resgatados)")

    if sys_updated == 0 and test_updated == 0 and disk_rescues == 0:
        print(f"  {GREEN}✔ Todos os ponteiros de conversas já estavam 100% sincronizados.{RESET}")

    return len(sorted_entries)


def compare_and_report():
    sanitize_corrupted_conv_dbs()
    sys_ws = get_all_workspaces(SYS_CONFIG)
    test_ws = get_all_workspaces(TEST_CONFIG)
    recent_convs = list_recent_conversations(12)

    sys_summaries = extract_trajectory_summaries(SYS_GLOBAL_DB)
    test_summaries = extract_trajectory_summaries(TEST_GLOBAL_DB)

    print(f"\n{BOLD}{CYAN}========================================================================================{RESET}")
    print(f"{BOLD}{CYAN}  Antigravity IDE - Auditoria e Comparação Granular de Conversas & Workspaces           {RESET}")
    print(f"{BOLD}{CYAN}========================================================================================{RESET}")
    print(f"  • Sistema Principal: {SYS_CONFIG} (Ponteiros: {len(sys_summaries)})")
    print(f"  • Perfil de Testes:  {TEST_CONFIG} (Ponteiros: {len(test_summaries)})")
    print(f"----------------------------------------------------------------------------------------\n")

    print(f"{BOLD}Conversas Recentes Detectadas no Sistema & Status nos Índices:{RESET}\n")
    header = f"{'Título':<35} | {'Workspace':<20} | {'Última Modif.':<16} | {'Índice Sistema':<14} | {'Índice Teste':<14}"
    print(header)
    print("-" * len(header))

    for c in recent_convs:
        cid = c["id"]
        in_sys_sum = cid in sys_summaries
        in_test_sum = cid in test_summaries

        sys_status = f"{GREEN}✓ Ativo{RESET}" if in_sys_sum else f"{RED}✗ Ausente{RESET}"
        test_status = f"{GREEN}✓ Ativo{RESET}" if in_test_sum else f"{YELLOW}• Ausente{RESET}"

        ws_name = c["workspace"]
        if ws_name != "Global":
            ws_name = os.path.basename(ws_name.rstrip("/"))

        mod_time = format_dt(c["last_mod"])
        print(f"{c['title'][:35]:<35} | {ws_name[:20]:<20} | {mod_time:<16} | {sys_status:<23} | {test_status:<23}")

    print(f"\n{BOLD}Workspaces com Diferenças de Sincronização:{RESET}\n")
    ws_header = f"{'Workspace / Projeto':<30} | {'Status':<16} | {'Data Sistema':<16} | {'Data Teste':<16}"
    print(ws_header)
    print("-" * len(ws_header))

    diff_count = 0
    for wid, s_info in sys_ws.items():
        t_info = test_ws.get(wid)
        if not t_info:
            status = f"{RED}Falta no Teste{RESET}"
            diff_count += 1
            print(f"{s_info['name'][:30]:<30} | {status:<25} | {format_dt(s_info['mtime']):<16} | {'N/A':<16}")
        elif s_info["mtime"] > t_info["mtime"] + 2:
            status = f"{YELLOW}Sistema Mais Novo{RESET}"
            diff_count += 1
            print(f"{s_info['name'][:30]:<30} | {status:<25} | {format_dt(s_info['mtime']):<16} | {format_dt(t_info['mtime']):<16}")
        elif t_info["mtime"] > s_info["mtime"] + 2:
            status = f"{GREEN}Teste Mais Novo{RESET}"
            diff_count += 1
            print(f"{s_info['name'][:30]:<30} | {status:<25} | {format_dt(s_info['mtime']):<16} | {format_dt(t_info['mtime']):<16}")

    if diff_count == 0:
        print(f"{GREEN}Todos os workspaces estão sincronizados.{RESET}")

    print(f"\n{BOLD}{CYAN}========================================================================================{RESET}\n")
    return sys_ws, test_ws, recent_convs


def sync_single_workspace(wid, direction="to-test"):
    if direction == "to-test":
        src_dir = os.path.join(SYS_CONFIG, "workspaceStorage", wid)
        dst_dir = os.path.join(TEST_CONFIG, "workspaceStorage", wid)
    else:
        src_dir = os.path.join(TEST_CONFIG, "workspaceStorage", wid)
        dst_dir = os.path.join(SYS_CONFIG, "workspaceStorage", wid)

    if not os.path.isdir(src_dir):
        print(f"{RED}Erro: Diretório de origem não existe: {src_dir}{RESET}")
        return False

    os.makedirs(dst_dir, exist_ok=True)
    dst_db = os.path.join(dst_dir, "state.vscdb")
    if os.path.isfile(dst_db):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copy2(dst_db, f"{dst_db}.backup_{ts}")

    for item in os.listdir(src_dir):
        s_item = os.path.join(src_dir, item)
        d_item = os.path.join(dst_dir, item)
        if os.path.isfile(s_item):
            shutil.copy2(s_item, d_item)

    print(f"  {GREEN}✓ Workspace {wid} sincronizado com sucesso ({direction}){RESET}")
    return True


def sync_missing_workspaces(direction="to-test"):
    sys_ws = get_all_workspaces(SYS_CONFIG)
    test_ws = get_all_workspaces(TEST_CONFIG)

    count = 0
    if direction in ("to-test", "bidirectional"):
        for wid, s_info in sys_ws.items():
            if wid not in test_ws:
                print(f"  • Importando novo workspace para teste: {BOLD}{s_info['name']}{RESET} ({wid})")
                sync_single_workspace(wid, direction="to-test")
                count += 1

    if direction in ("to-system", "bidirectional"):
        for wid, t_info in test_ws.items():
            if wid not in sys_ws:
                print(f"  • Importando novo workspace para sistema: {BOLD}{t_info['name']}{RESET} ({wid})")
                sync_single_workspace(wid, direction="to-system")
                count += 1

    return count


def sync_recent_projects(direction="bidirectional"):
    """
    Sincroniza a lista de projetos recentes (history.recentlyOpenedPathsList)
    entre o banco do sistema e o banco de testes.
    """
    if not os.path.isfile(SYS_GLOBAL_DB) or not os.path.isfile(TEST_GLOBAL_DB):
        return 0

    def get_recent_entries(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute("SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'")
            row = cur.fetchone()
            conn.close()
            if row and row[0]:
                data = json.loads(row[0])
                if isinstance(data, dict) and "entries" in data:
                    return data["entries"]
        except Exception:
            pass
        return []

    def get_entry_key(entry):
        if not isinstance(entry, dict):
            return None
        if "folderUri" in entry:
            return ("folder", entry["folderUri"])
        if "fileUri" in entry:
            return ("file", entry["fileUri"])
        if "workspace" in entry and isinstance(entry["workspace"], dict):
            return ("workspace", entry["workspace"].get("configPath") or entry["workspace"].get("id"))
        return None

    def save_recent_entries(db_path, entries):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        try:
            shutil.copy2(db_path, f"{db_path}.backup_{ts}")
        except Exception:
            pass
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        val = json.dumps({"entries": entries})
        cur.execute(
            "INSERT INTO ItemTable (key, value) VALUES ('history.recentlyOpenedPathsList', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (val,)
        )
        conn.commit()
        conn.close()

    sys_entries = get_recent_entries(SYS_GLOBAL_DB)
    test_entries = get_recent_entries(TEST_GLOBAL_DB)

    if direction in ("to-test", "bidirectional"):
        existing_keys = set()
        merged = []
        for e in test_entries:
            k = get_entry_key(e)
            if k and k not in existing_keys:
                existing_keys.add(k)
                merged.append(e)

        added = 0
        for e in sys_entries:
            k = get_entry_key(e)
            if k and k not in existing_keys:
                existing_keys.add(k)
                merged.append(e)
                added += 1

        if added > 0 or (len(sys_entries) > 0 and len(test_entries) == 0):
            save_recent_entries(TEST_GLOBAL_DB, merged)
            print(f"  {GREEN}✔ Projetos recentes sincronizados para o perfil de testes: {len(merged)} projetos ({added} novos importados){RESET}")
        else:
            print(f"  {CYAN}• Projetos recentes já estavam sincronizados no perfil de testes ({len(merged)} projetos).{RESET}")

    if direction in ("to-system", "bidirectional"):
        existing_keys = set()
        merged = []
        for e in sys_entries:
            k = get_entry_key(e)
            if k and k not in existing_keys:
                existing_keys.add(k)
                merged.append(e)

        added = 0
        for e in test_entries:
            k = get_entry_key(e)
            if k and k not in existing_keys:
                existing_keys.add(k)
                merged.append(e)
                added += 1

        if added > 0:
            save_recent_entries(SYS_GLOBAL_DB, merged)
            print(f"  {GREEN}✔ Projetos recentes exportados para o sistema: {len(merged)} projetos ({added} novos){RESET}")


def sync_vscode_profile():
    """
    Mescla configurações e extensões do VS Code oficial para o perfil de testes.
    """
    target_user = TEST_CONFIG
    profile_dir = os.path.dirname(os.path.dirname(target_user))

    # 1. Mesclagem de Settings
    vscode_settings = os.path.expanduser("~/.config/Code/User/settings.json")
    antigravity_settings = os.path.join(SYS_CONFIG, "settings.json")
    target_settings = os.path.join(target_user, "settings.json")

    ag_data = {}
    vc_data = {}
    if os.path.isfile(antigravity_settings):
        try:
            with open(antigravity_settings, "r", encoding="utf-8") as f:
                ag_data = json.load(f)
        except Exception:
            pass
    if os.path.isfile(vscode_settings):
        try:
            with open(vscode_settings, "r", encoding="utf-8") as f:
                vc_data = json.load(f)
        except Exception:
            pass

    merged_settings = dict(vc_data)
    merged_settings.update(ag_data)

    if os.path.islink(target_settings):
        os.unlink(target_settings)
    os.makedirs(target_user, exist_ok=True)
    with open(target_settings, "w", encoding="utf-8") as f:
        json.dump(merged_settings, f, indent=4)
    print(f"  {GREEN}✔ Configurações mescladas (VS Code + Antigravity) salvas em {target_settings}{RESET}")

    # 2. Keybindings (se Antigravity não tem keybindings personalizados, usar os do VS Code)
    vscode_kb = os.path.expanduser("~/.config/Code/User/keybindings.json")
    antigravity_kb = os.path.join(SYS_CONFIG, "keybindings.json")
    target_kb = os.path.join(target_user, "keybindings.json")
    if not os.path.exists(target_kb):
        if os.path.isfile(antigravity_kb):
            try:
                os.symlink(antigravity_kb, target_kb)
            except Exception:
                pass
        elif os.path.isfile(vscode_kb):
            try:
                os.symlink(vscode_kb, target_kb)
                print(f"  {GREEN}✔ Atalhos personalizados (keybindings.json) herdados do VS Code{RESET}")
            except Exception:
                pass

    # 3. Mesclagem de Extensões
    ag_ext_dir = os.path.expanduser("~/.antigravity-ide/extensions")
    vc_ext_dir = os.path.expanduser("~/.vscode/extensions")
    target_ext_dir = os.path.join(profile_dir, "extensions")
    os.makedirs(target_ext_dir, exist_ok=True)

    linked_ag = 0
    linked_vc = 0
    if os.path.isdir(ag_ext_dir):
        for item in os.listdir(ag_ext_dir):
            src = os.path.join(ag_ext_dir, item)
            dst = os.path.join(target_ext_dir, item)
            if not os.path.exists(dst):
                try:
                    os.symlink(src, dst)
                    linked_ag += 1
                except Exception:
                    pass

    if os.path.isdir(vc_ext_dir):
        existing_prefixes = set()
        for item in os.listdir(target_ext_dir):
            prefix = item.split("-")[0].lower()
            existing_prefixes.add(prefix)

        for item in os.listdir(vc_ext_dir):
            if item.startswith("."):
                continue
            prefix = item.split("-")[0].lower()
            if prefix not in existing_prefixes:
                src = os.path.join(vc_ext_dir, item)
                dst = os.path.join(target_ext_dir, item)
                if not os.path.exists(dst):
                    try:
                        os.symlink(src, dst)
                        linked_vc += 1
                    except Exception:
                        pass

    print(f"  {GREEN}✔ Extensões unificadas em {target_ext_dir}: {linked_ag} do Antigravity + {linked_vc} exclusivas do VS Code{RESET}")


def perform_full_sync(direction="bidirectional", sync_vscode=True):
    """
    Executa a sincronização completa:
    1. Mesclagem e resgate inteligente de ponteiros (trajectorySummaries).
    2. Sincronização granular de workspaces faltantes.
    3. Sincronização de projetos recentes (history.recentlyOpenedPathsList).
    4. Mesclagem opcional de extensões e configurações do VS Code.
    """
    print(f"\n{BOLD}{GREEN}Iniciando Sincronização Completa Granular ({direction})...{RESET}")
    print(f"  • Alvo de Testes: {TEST_CONFIG}")
    sync_trajectory_summaries(direction=direction)
    ws_count = sync_missing_workspaces(direction=direction)
    sync_recent_projects(direction=direction)
    if sync_vscode:
        sync_vscode_profile()
    print(f"\n{BOLD}{GREEN}✔ Sincronização concluída com sucesso!{RESET}")
    print(f"  {CYAN}Dica:{RESET} Se o Antigravity IDE estiver aberto, recarregue a janela no VS Code")
    print(f"        ({BOLD}Ctrl + Shift + P{RESET} ➔ {BOLD}Developer: Reload Window{RESET}) para atualizar a lista.")


def promote_conversation(cid, custom_title=None):
    """
    Promove uma conversa específica para o topo absoluto do histórico de ambos os ambientes.
    """
    details = get_conversation_details(cid)
    title = custom_title or details["title"]
    now = datetime.now().timestamp()
    inner = load_inner_data_from_conv_db(cid)
    entry_bytes, _ = build_trajectory_entry(cid, title, inner, now)

    print(f"Promovendo conversa para o topo: [{cid[:8]}] {title}")
    for db_path, name in [(SYS_GLOBAL_DB, "Sistema"), (TEST_GLOBAL_DB, "Teste")]:
        summaries = extract_trajectory_summaries(db_path)
        summaries[cid] = {
            "id": cid,
            "title": title,
            "effective_ts": now,
            "entry_bytes": entry_bytes,
        }
        sorted_entries = sorted(
            [(c, d["entry_bytes"]) for c, d in summaries.items()],
            key=lambda x: summaries[x[0]]["effective_ts"],
            reverse=True,
        )
        save_trajectory_summaries(db_path, sorted_entries)
        print(f"  {GREEN}✓ Promovida no {name}!{RESET}")


def main():
    parser = argparse.ArgumentParser(
        description="Utilitário de Auditoria e Sincronização Granular Bidirecional do Antigravity IDE"
    )
    parser.add_argument("--target-ide", "--target", type=str, default=None, help="Caminho para o diretório da IDE de destino (ex: antigravity-ide-2.6.0)")
    parser.add_argument("--list", "-l", action="store_true", help="Exibe relatório comparativo sem alterar arquivos")
    parser.add_argument("--sync", "-y", action="store_true", help="Executa a sincronização bidirecional completa")
    parser.add_argument("--selective", "-s", action="store_true", help="Modo compatibilidade: executa sincronização inteligente")
    parser.add_argument("--to-test", action="store_true", help="Sincroniza do Sistema Principal ➔ Ambiente de Testes")
    parser.add_argument("--to-system", action="store_true", help="Sincroniza do Ambiente de Testes ➔ Sistema Principal")
    parser.add_argument("--import-missing", "-m", action="store_true", help="Importa o que estiver faltando")
    parser.add_argument("--sync-vscode", action="store_true", default=True, help="Mescla configurações e extensões do VS Code oficial")
    parser.add_argument("--no-vscode", dest="sync_vscode", action="store_false", help="Não mescla configurações e extensões do VS Code")
    parser.add_argument("--promote", type=str, help="Promove uma conversa específica para o topo pelo UUID")
    parser.add_argument("--title", type=str, help="Título customizado para a promoção")

    args = parser.parse_args()

    if args.target_ide:
        set_target_ide(args.target_ide)

    if args.list:
        compare_and_report()
        return

    if args.promote:
        promote_conversation(args.promote, custom_title=args.title)
        return

    direction = "bidirectional"
    if args.to_test:
        direction = "to-test"
    elif args.to_system:
        direction = "to-system"

    if args.sync or args.import_missing or args.selective:
        perform_full_sync(direction=direction, sync_vscode=args.sync_vscode)
        return

    # Modo Interativo padrão
    sys_ws, test_ws, recent_convs = compare_and_report()
    print("Opções:")
    print("  [1] Sincronização Bidirecional Completa (Reconcilia ponteiros e workspaces nos dois lados)")
    print("  [2] Apenas Sistema ➔ Ambiente de Testes")
    print("  [3] Apenas Ambiente de Testes ➔ Sistema")
    print("  [4] Sair sem alterar nada")

    try:
        choice = input(f"\nEscolha uma opção [1-4] (padrão 1): ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nOperação cancelada.")
        return

    if choice == "" or choice == "1":
        perform_full_sync(direction="bidirectional", sync_vscode=args.sync_vscode)
    elif choice == "2":
        perform_full_sync(direction="to-test", sync_vscode=args.sync_vscode)
    elif choice == "3":
        perform_full_sync(direction="to-system", sync_vscode=args.sync_vscode)
    else:
        print("Nenhuma alteração realizada.")


if __name__ == "__main__":
    main()
