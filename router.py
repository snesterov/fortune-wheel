# -*- coding: utf-8 -*-
"""
WHITE-LABEL MULTI-BOT DISPATCHER (Router)
- Handles leads from Fortune Wheel & websites
- Dispatches each lead using the CLIENT'S OWN BOT TOKEN to CLIENT'S CHAT
- Sends an instant admin copy to Sergey's master chat
- Supports Telegram & MAX messenger
- Saves leads to local database (leads.json)
"""

import os
import json
import time
import urllib.request
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECTS_FILE = os.path.join(BASE_DIR, 'projects.json')
LEADS_FILE = os.path.join(BASE_DIR, 'leads.json')

# Твой главный админский чат (куда всегда падает копия всех лидов со всех проектов)
ADMIN_MASTER_CHAT_ID = "324874531"
FALLBACK_BOT_TOKEN = "8296699382:AAFDhuSBywHV0dEVduG5MSNmeqd7tbAj6oY"

def load_projects():
    if os.path.exists(PROJECTS_FILE):
        try:
            with open(PROJECTS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_lead_to_db(lead_entry):
    leads = []
    if os.path.exists(LEADS_FILE):
        try:
            with open(LEADS_FILE, 'r', encoding='utf-8') as f:
                leads = json.load(f)
        except Exception:
            leads = []
    leads.append(lead_entry)
    try:
        with open(LEADS_FILE, 'w', encoding='utf-8') as f:
            json.dump(leads, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Save lead error:", e)

def send_telegram(token, chat_id, text, buttons=None):
    if not token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": buttons}
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"Telegram dispatch error to {chat_id}:", e)
        return False

def send_max_webhook(url, lead_data):
    if not url:
        return False
    try:
        data = json.dumps(lead_data).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print("MAX webhook error:", e)
        return False

@app.route('/api/lead', methods=['POST'])
def process_lead():
    payload = request.json or {}
    project_id = payload.get('projectId') or payload.get('project') or 'wolfhunt'
    name = payload.get('name') or 'Гость'
    phone = payload.get('phone') or 'Не указан'
    prize = payload.get('prize') or 'Бонус'
    promo = payload.get('promo') or 'PROMO'
    source_url = payload.get('url') or request.headers.get('Referer', '')

    projects = load_projects()
    project_cfg = projects.get(project_id, {})
    project_name = project_cfg.get('name', project_id)

    # Клиентский бот и чат
    client_bot_token = project_cfg.get('bot_token') or FALLBACK_BOT_TOKEN
    client_chat_id = project_cfg.get('chat_id') or ADMIN_MASTER_CHAT_ID

    now_str = datetime.now().strftime("%d.%m.%Y %H:%M")

    # 1. Текст для клиента
    client_msg = (
        f"🎁 <b>НОВАЯ ЗАЯВКА — КОЛЕСО ФОРТУНЫ</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>Имя:</b> {name}\n"
        f"📱 <b>Телефон:</b> <code>{phone}</code>\n"
        f"🏆 <b>Выиграл приз:</b> {prize}\n"
        f"🎫 <b>Промокод:</b> <code>{promo}</code>\n"
        f"⏰ <b>Время:</b> {now_str}\n"
        f"━━━━━━━━━━━━━━━━━━"
    )

    clean_phone = "".join(filter(str.isdigit, phone))
    call_btn = [[{"text": "📞 Позвонить клиенту", "url": f"tel:{clean_phone}"}]] if clean_phone else None

    # Отправка клиенту в его личный чат через его бота
    send_telegram(client_bot_token, client_chat_id, client_msg, call_btn)

    # 2. Если чат клиента отличается от админского — отправка копии Сергею (Админу)
    if str(client_chat_id) != str(ADMIN_MASTER_CHAT_ID):
        admin_msg = (
            f"🔔 <b>[ЛИД: {project_name}]</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"👤 <b>Имя:</b> {name}\n"
            f"📱 <b>Телефон:</b> <code>{phone}</code>\n"
            f"🏆 <b>Приз:</b> {prize} ({promo})\n"
            f"🌐 <b>Сайт:</b> {source_url}\n"
            f"🤖 <b>Бот клиента:</b> @{project_cfg.get('bot_username', 'бот')}\n"
            f"⏰ <b>Время:</b> {now_str}\n"
            f"━━━━━━━━━━━━━━━━━━"
        )
        send_telegram(FALLBACK_BOT_TOKEN, ADMIN_MASTER_CHAT_ID, admin_msg, call_btn)

    # 3. Отправка в MAX (если настроена ссылка или webhook)
    if project_cfg.get('max_link'):
        send_max_webhook(project_cfg.get('max_link'), payload)

    # 4. Сохранение в базу
    lead_entry = {
        "timestamp": now_str,
        "project": project_id,
        "projectName": project_name,
        "name": name,
        "phone": phone,
        "prize": prize,
        "promo": promo,
        "url": source_url
    }
    save_lead_to_db(lead_entry)

    return jsonify({
        "status": "ok",
        "project": project_id,
        "delivered_to_client": bool(client_chat_id),
        "admin_notified": True
    })

if __name__ == '__main__':
    print(f"[*] White-Label Multi-Bot Dispatcher запущен на порту 5000...")
    app.run(host='0.0.0.0', port=5000)
