#!/usr/bin/env python3
"""Sales Dashboard + WhatsApp Marketing Platform Server."""
import http.server
import json
import os
import uuid
import urllib.request
import urllib.error
import time
import logging
from datetime import datetime
from urllib.parse import urlparse, parse_qs

# ─── Load .env file if present ────────────────────────────────
ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(ENV_FILE):
    with open(ENV_FILE) as ef:
        for line in ef:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and val:
                os.environ.setdefault(key, val)

PORT = int(os.environ.get('PORT', 8080))
API_URL = 'https://linkedin-ads-dashboard.vercel.app/api/linkedin/leads?accountId=517988166&limit=500'
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
FLOWS_DIR = os.path.join(DATA_DIR, 'flows')
CONVS_DIR = os.path.join(DATA_DIR, 'conversations')
CAMPAIGNS_DIR = os.path.join(DATA_DIR, 'campaigns')
TEMPLATES_DIR = os.path.join(DATA_DIR, 'templates')
CONTACTLISTS_DIR = os.path.join(DATA_DIR, 'contact-lists')
TRACKING_FILE = os.path.join(DATA_DIR, 'email-tracking.json')
MSG_LOG_FILE = os.path.join(DATA_DIR, 'message-log.json')

# WhatsApp Cloud API config — Single Koenig Solutions Brand Account
# All messages are sent from the single Koenig WhatsApp Business number
WA_ACCESS_TOKEN = os.environ.get('WHATSAPP_ACCESS_TOKEN', '')
WA_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
WA_BUSINESS_ACCOUNT_ID = os.environ.get('WHATSAPP_BUSINESS_ACCOUNT_ID', '')
WA_VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', 'sales_dashboard_verify')
WA_API_VERSION = os.environ.get('WA_API_VERSION', 'v21.0')
WA_BRAND_NAME = os.environ.get('WA_BRAND_NAME', 'Koenig Solutions')

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('wa-server')

# Ensure data directories exist
os.makedirs(FLOWS_DIR, exist_ok=True)
os.makedirs(CONVS_DIR, exist_ok=True)
os.makedirs(CAMPAIGNS_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(CONTACTLISTS_DIR, exist_ok=True)


# ─── Flow Storage ───────────────────────────────────────────────
def flows_get_all():
    flows = []
    for f in os.listdir(FLOWS_DIR):
        if f.endswith('.json'):
            with open(os.path.join(FLOWS_DIR, f)) as fh:
                data = json.load(fh)
                flows.append({
                    'id': data.get('id'),
                    'name': data.get('name'),
                    'isActive': data.get('isActive', False),
                    'updatedAt': data.get('updatedAt', '')
                })
    return flows

def flows_get_by_id(flow_id):
    path = os.path.join(FLOWS_DIR, f'{flow_id}.json')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

def flows_save(flow):
    now = datetime.utcnow().isoformat() + 'Z'
    if not flow.get('id'):
        flow['id'] = 'flow_' + str(int(datetime.utcnow().timestamp() * 1000)) + '_' + uuid.uuid4().hex[:4]
        flow['createdAt'] = now
    flow['updatedAt'] = now
    path = os.path.join(FLOWS_DIR, f"{flow['id']}.json")
    with open(path, 'w') as f:
        json.dump(flow, f, indent=2)
    return flow

def flows_delete(flow_id):
    path = os.path.join(FLOWS_DIR, f'{flow_id}.json')
    if os.path.exists(path):
        os.remove(path)
        return True
    return False

def flows_set_active(flow_id):
    for f in os.listdir(FLOWS_DIR):
        if f.endswith('.json'):
            path = os.path.join(FLOWS_DIR, f)
            with open(path) as fh:
                data = json.load(fh)
            data['isActive'] = (data.get('id') == flow_id)
            data['updatedAt'] = datetime.utcnow().isoformat() + 'Z'
            with open(path, 'w') as fh:
                json.dump(data, fh, indent=2)

def flows_get_active():
    for f in os.listdir(FLOWS_DIR):
        if f.endswith('.json'):
            with open(os.path.join(FLOWS_DIR, f)) as fh:
                data = json.load(fh)
                if data.get('isActive'):
                    return data
    return None


# ─── Conversation Storage ───────────────────────────────────────
def sanitize_phone(phone):
    return ''.join(c for c in phone if c.isdigit() or c == '+')

def convs_get_by_phone(phone):
    path = os.path.join(CONVS_DIR, f'{sanitize_phone(phone)}.json')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

def convs_create_or_get(phone, lead_id=None, lead_name=''):
    conv = convs_get_by_phone(phone)
    if not conv:
        now = datetime.utcnow().isoformat() + 'Z'
        conv = {
            'phone': sanitize_phone(phone),
            'leadId': lead_id,
            'leadName': lead_name,
            'flowState': None,
            'messages': [],
            'createdAt': now,
            'updatedAt': now
        }
        convs_save(conv)
    return conv

def convs_add_message(phone, message):
    conv = convs_create_or_get(phone)
    if not message.get('id'):
        message['id'] = 'msg_' + str(int(datetime.utcnow().timestamp() * 1000)) + '_' + uuid.uuid4().hex[:4]
    if not message.get('timestamp'):
        message['timestamp'] = datetime.utcnow().isoformat() + 'Z'
    conv['messages'].append(message)
    conv['updatedAt'] = datetime.utcnow().isoformat() + 'Z'
    convs_save(conv)
    return message

def convs_save(conv):
    path = os.path.join(CONVS_DIR, f"{sanitize_phone(conv['phone'])}.json")
    with open(path, 'w') as f:
        json.dump(conv, f, indent=2)

def convs_list_all():
    convs = []
    for f in os.listdir(CONVS_DIR):
        if f.endswith('.json'):
            with open(os.path.join(CONVS_DIR, f)) as fh:
                data = json.load(fh)
                last_msg = data['messages'][-1] if data.get('messages') else None
                convs.append({
                    'phone': data.get('phone'),
                    'leadId': data.get('leadId'),
                    'leadName': data.get('leadName', ''),
                    'lastMessage': last_msg.get('text', '[media]') if last_msg else '',
                    'lastMessageAt': last_msg.get('timestamp', data.get('createdAt')) if last_msg else data.get('createdAt'),
                    'messageCount': len(data.get('messages', []))
                })
    convs.sort(key=lambda c: c.get('lastMessageAt', ''), reverse=True)
    return convs


# ─── Campaign Storage ──────────────────────────────────────────
def campaigns_get_all():
    campaigns = []
    for f in os.listdir(CAMPAIGNS_DIR):
        if f.endswith('.json'):
            with open(os.path.join(CAMPAIGNS_DIR, f)) as fh:
                data = json.load(fh)
                campaigns.append({
                    'id': data.get('id'),
                    'name': data.get('name'),
                    'status': data.get('status', 'draft'),
                    'subject': data.get('subject', ''),
                    'stats': data.get('stats', {'sent': 0, 'opened': 0, 'clicked': 0, 'bounced': 0}),
                    'sentAt': data.get('sentAt'),
                    'createdAt': data.get('createdAt', ''),
                    'updatedAt': data.get('updatedAt', '')
                })
    campaigns.sort(key=lambda c: c.get('updatedAt', ''), reverse=True)
    return campaigns

def campaigns_get_by_id(campaign_id):
    path = os.path.join(CAMPAIGNS_DIR, f'{campaign_id}.json')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

def campaigns_save(campaign):
    now = datetime.utcnow().isoformat() + 'Z'
    if not campaign.get('id'):
        campaign['id'] = 'camp_' + str(int(datetime.utcnow().timestamp() * 1000)) + '_' + uuid.uuid4().hex[:4]
        campaign['createdAt'] = now
    if not campaign.get('stats'):
        campaign['stats'] = {'sent': 0, 'opened': 0, 'clicked': 0, 'bounced': 0}
    if not campaign.get('status'):
        campaign['status'] = 'draft'
    campaign['updatedAt'] = now
    path = os.path.join(CAMPAIGNS_DIR, f"{campaign['id']}.json")
    with open(path, 'w') as f:
        json.dump(campaign, f, indent=2)
    return campaign

def campaigns_delete(campaign_id):
    path = os.path.join(CAMPAIGNS_DIR, f'{campaign_id}.json')
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


# ─── Email Template Storage ───────────────────────────────────
DEFAULT_WELCOME_TEMPLATE = {
    'name': 'Welcome Email',
    'subject': 'Welcome to our platform!',
    'isPrebuilt': True,
    'htmlContent': '''<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #2563eb;">Welcome, {{name}}!</h1>
<p>Thank you for joining us. We are excited to have you on board.</p>
<p>If you have any questions, feel free to reach out to our team.</p>
<p style="margin-top: 30px;">Best regards,<br>The Sales Team</p>
</body></html>'''
}

def templates_get_all():
    templates = []
    for f in os.listdir(TEMPLATES_DIR):
        if f.endswith('.json'):
            with open(os.path.join(TEMPLATES_DIR, f)) as fh:
                data = json.load(fh)
                templates.append({
                    'id': data.get('id'),
                    'name': data.get('name'),
                    'subject': data.get('subject', ''),
                    'isPrebuilt': data.get('isPrebuilt', False),
                    'updatedAt': data.get('updatedAt', '')
                })
    # If no templates exist, create the default welcome template
    if not templates:
        tpl = templates_save(dict(DEFAULT_WELCOME_TEMPLATE))
        templates.append({
            'id': tpl['id'],
            'name': tpl['name'],
            'subject': tpl['subject'],
            'isPrebuilt': tpl.get('isPrebuilt', False),
            'updatedAt': tpl['updatedAt']
        })
    templates.sort(key=lambda t: t.get('updatedAt', ''), reverse=True)
    return templates

def templates_get_by_id(template_id):
    path = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

def templates_save(template):
    now = datetime.utcnow().isoformat() + 'Z'
    if not template.get('id'):
        template['id'] = 'tpl_' + str(int(datetime.utcnow().timestamp() * 1000)) + '_' + uuid.uuid4().hex[:4]
        template['createdAt'] = now
    template['updatedAt'] = now
    path = os.path.join(TEMPLATES_DIR, f"{template['id']}.json")
    with open(path, 'w') as f:
        json.dump(template, f, indent=2)
    return template

def templates_delete(template_id):
    path = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


# ─── Contact List Storage ─────────────────────────────────────
def contactlists_get_all():
    lists = []
    for f in os.listdir(CONTACTLISTS_DIR):
        if f.endswith('.json'):
            with open(os.path.join(CONTACTLISTS_DIR, f)) as fh:
                data = json.load(fh)
                lists.append({
                    'id': data.get('id'),
                    'name': data.get('name'),
                    'description': data.get('description', ''),
                    'contactCount': len(data.get('contacts', [])),
                    'updatedAt': data.get('updatedAt', '')
                })
    lists.sort(key=lambda l: l.get('updatedAt', ''), reverse=True)
    return lists

def contactlists_get_by_id(list_id):
    path = os.path.join(CONTACTLISTS_DIR, f'{list_id}.json')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

def contactlists_save(contact_list):
    now = datetime.utcnow().isoformat() + 'Z'
    if not contact_list.get('id'):
        contact_list['id'] = 'cl_' + str(int(datetime.utcnow().timestamp() * 1000)) + '_' + uuid.uuid4().hex[:4]
        contact_list['createdAt'] = now
    contact_list['updatedAt'] = now
    path = os.path.join(CONTACTLISTS_DIR, f"{contact_list['id']}.json")
    with open(path, 'w') as f:
        json.dump(contact_list, f, indent=2)
    return contact_list

def contactlists_delete(list_id):
    path = os.path.join(CONTACTLISTS_DIR, f'{list_id}.json')
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


# ─── Email Tracking Storage ───────────────────────────────────
def tracking_get():
    if not os.path.exists(TRACKING_FILE):
        return {}
    with open(TRACKING_FILE) as f:
        return json.load(f)

def tracking_save(data):
    with open(TRACKING_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def tracking_update_campaign(campaign_id, stats):
    tracking = tracking_get()
    tracking[campaign_id] = stats
    tracking_save(tracking)


# ─── Flow Engine (Simulation) ──────────────────────────────────
def interpolate_text(text, data, contact_name=''):
    result = text
    result = result.replace('{{name}}', contact_name or 'there')
    result = result.replace('{{Name}}', contact_name or 'there')
    for key, value in data.items():
        result = result.replace('{{' + key + '}}', str(value))
    return result

def simulate_flow(flow, initial_message='hi'):
    responses = []
    start_node = next((n for n in flow.get('nodes', []) if n['type'] == 'start'), None)
    if not start_node:
        return responses

    connections = flow.get('connections', [])
    first_conn = next((c for c in connections if c['from'] == start_node['id']), None)
    if not first_conn:
        return responses

    current_id = first_conn['to']
    nodes_map = {n['id']: n for n in flow.get('nodes', [])}
    collected = {}
    iterations = 0

    while current_id and iterations < 20:
        iterations += 1
        node = nodes_map.get(current_id)
        if not node:
            break

        if node['type'] == 'message':
            responses.append({
                'type': 'message',
                'text': interpolate_text(node['data'].get('messageText', ''), collected, 'Test User')
            })
            conn = next((c for c in connections if c['from'] == current_id and c.get('fromPort') == 'out'), None)
            current_id = conn['to'] if conn else None

        elif node['type'] == 'question':
            responses.append({
                'type': 'question',
                'text': node['data'].get('questionText', ''),
                'options': node['data'].get('options', []),
                'waitingForInput': True
            })
            break

        elif node['type'] == 'action':
            responses.append({
                'type': 'action',
                'actionType': node['data'].get('actionType', ''),
                'label': node['data'].get('label', '')
            })
            conn = next((c for c in connections if c['from'] == current_id and c.get('fromPort') == 'out'), None)
            current_id = conn['to'] if conn else None

        elif node['type'] == 'delay':
            responses.append({
                'type': 'delay',
                'duration': node['data'].get('duration', 1),
                'unit': node['data'].get('unit', 'seconds')
            })
            conn = next((c for c in connections if c['from'] == current_id and c.get('fromPort') == 'out'), None)
            current_id = conn['to'] if conn else None

        elif node['type'] == 'condition':
            conn = next((c for c in connections if c['from'] == current_id and c.get('fromPort') == 'true'), None)
            current_id = conn['to'] if conn else None

        else:
            break

    return responses


# ─── Phone Number Sanitization ─────────────────────────────────
def sanitize_wa_phone(phone):
    """Clean phone for WhatsApp API: digits only, ensure country code, no leading +/0."""
    if not phone:
        return ''
    # Remove all non-digit characters
    digits = ''.join(c for c in str(phone) if c.isdigit())
    # Remove leading zeros
    digits = digits.lstrip('0')
    # If Indian number without country code (10 digits), prepend 91
    if len(digits) == 10:
        digits = '91' + digits
    return digits


# ─── Message Logging ──────────────────────────────────────────
def log_message(entry):
    """Append a message send record to the log file."""
    try:
        logs = []
        if os.path.exists(MSG_LOG_FILE):
            with open(MSG_LOG_FILE) as f:
                logs = json.load(f)
        logs.append(entry)
        # Keep last 1000 entries
        if len(logs) > 1000:
            logs = logs[-1000:]
        with open(MSG_LOG_FILE, 'w') as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        logger.error(f'Failed to write message log: {e}')


# ─── WhatsApp API Calls ────────────────────────────────────────
def wa_send_text(phone, text, lead_name='', csm_name='', retries=2):
    """Send a WhatsApp text message via the single Koenig Solutions Brand Account.

    All messages are sent from the single Koenig WhatsApp Business number
    configured in .env (WHATSAPP_PHONE_NUMBER_ID).

    Args:
        phone: Recipient phone number (any format — will be sanitized)
        text: Message text (max 4096 chars)
        lead_name: Name of the lead (for logging)
        csm_name: CSM assigned to this lead (for logging/tracking only)
        retries: Number of retry attempts on failure
    """
    if not WA_ACCESS_TOKEN:
        return {'error': f'WhatsApp API not configured. Add WHATSAPP_ACCESS_TOKEN to .env file.', 'simulated': True}

    if not WA_PHONE_NUMBER_ID:
        return {'error': f'No Koenig WhatsApp Phone Number ID. Add WHATSAPP_PHONE_NUMBER_ID to .env file.', 'simulated': True}

    sender_id = WA_PHONE_NUMBER_ID

    # Sanitize recipient phone
    clean_phone = sanitize_wa_phone(phone)
    if not clean_phone or len(clean_phone) < 10:
        return {'error': f'Invalid phone number: {phone}'}

    # Truncate message if over WhatsApp limit
    if len(text) > 4096:
        text = text[:4093] + '...'

    url = f'https://graph.facebook.com/{WA_API_VERSION}/{sender_id}/messages'
    payload = json.dumps({
        'messaging_product': 'whatsapp',
        'to': clean_phone,
        'type': 'text',
        'text': {'body': text}
    }).encode()
    headers = {
        'Authorization': f'Bearer {WA_ACCESS_TOKEN}',
        'Content-Type': 'application/json'
    }

    last_error = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=payload, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
                msg_id = result.get('messages', [{}])[0].get('id', '')
                logger.info(f'WhatsApp SENT to {clean_phone} ({lead_name}) | CSM: {csm_name or "N/A"} | Brand: {WA_BRAND_NAME} | msg_id={msg_id}')
                log_message({
                    'timestamp': datetime.utcnow().isoformat() + 'Z',
                    'to': clean_phone,
                    'leadName': lead_name,
                    'csmName': csm_name,
                    'brand': WA_BRAND_NAME,
                    'messageId': msg_id,
                    'status': 'sent',
                    'textPreview': text[:100]
                })
                return result
        except urllib.error.HTTPError as e:
            error_body = ''
            try:
                error_body = e.read().decode()
            except Exception:
                pass
            last_error = f'HTTP {e.code}: {error_body or str(e)}'
            logger.warning(f'WhatsApp API error (attempt {attempt+1}/{retries+1}) to {clean_phone}: {last_error}')
            # Retry on rate limit (429) or server errors (5xx)
            if e.code == 429 or e.code >= 500:
                time.sleep(1 * (attempt + 1))  # Exponential backoff
                continue
            break  # Don't retry on 4xx client errors (except 429)
        except Exception as e:
            last_error = str(e)
            logger.warning(f'WhatsApp send error (attempt {attempt+1}/{retries+1}) to {clean_phone}: {last_error}')
            time.sleep(1 * (attempt + 1))

    logger.error(f'WhatsApp FAILED to {clean_phone} ({lead_name}) | CSM: {csm_name or "N/A"} | after {retries+1} attempts: {last_error}')
    log_message({
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'to': clean_phone,
        'leadName': lead_name,
        'csmName': csm_name,
        'brand': WA_BRAND_NAME,
        'status': 'failed',
        'error': last_error,
        'textPreview': text[:100]
    })
    return {'error': last_error}


# ─── HTTP Handler ───────────────────────────────────────────────
class APIHandler(http.server.SimpleHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/leads' or path.startswith('/api/leads?'):
            self.proxy_linkedin_api()
        elif path == '/api/flows':
            self.json_response(200, {'flows': flows_get_all()})
        elif path.startswith('/api/flows/'):
            flow_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            flow = flows_get_by_id(flow_id)
            if flow:
                self.json_response(200, {'flow': flow})
            else:
                self.json_response(404, {'error': 'Flow not found'})
        elif path == '/api/conversations':
            self.json_response(200, {'conversations': convs_list_all()})
        elif path.startswith('/api/conversations/phone/'):
            phone = path.split('/')[4] if len(path.split('/')) > 4 else ''
            conv = convs_get_by_phone(phone)
            if conv:
                self.json_response(200, {'conversation': conv})
            else:
                self.json_response(404, {'error': 'Conversation not found'})
        elif path.startswith('/api/conversations/lead/'):
            lead_id = path.split('/')[4] if len(path.split('/')) > 4 else ''
            all_convs = convs_list_all()
            match = next((c for c in all_convs if c.get('leadId') == lead_id), None)
            if match:
                conv = convs_get_by_phone(match['phone'])
                self.json_response(200, {'conversation': conv})
            else:
                self.json_response(404, {'error': 'No conversation for this lead'})
        elif path == '/api/webhook':
            # WhatsApp webhook verification
            params = parse_qs(parsed.query)
            mode = params.get('hub.mode', [''])[0]
            token = params.get('hub.verify_token', [''])[0]
            challenge = params.get('hub.challenge', [''])[0]
            if mode == 'subscribe' and token == WA_VERIFY_TOKEN:
                self.send_response(200)
                self._cors_headers()
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(challenge.encode())
            else:
                self.json_response(403, {'error': 'Verification failed'})

        # ─── Email Marketing GET endpoints ─────────────────────
        elif path == '/api/campaigns':
            self.json_response(200, {'campaigns': campaigns_get_all()})
        elif path.startswith('/api/campaigns/'):
            campaign_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            campaign = campaigns_get_by_id(campaign_id)
            if campaign:
                self.json_response(200, {'campaign': campaign})
            else:
                self.json_response(404, {'error': 'Campaign not found'})
        elif path == '/api/email-templates':
            self.json_response(200, {'templates': templates_get_all()})
        elif path.startswith('/api/email-templates/'):
            template_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            template = templates_get_by_id(template_id)
            if template:
                self.json_response(200, {'template': template})
            else:
                self.json_response(404, {'error': 'Template not found'})
        elif path == '/api/contact-lists':
            self.json_response(200, {'lists': contactlists_get_all()})
        elif path.startswith('/api/contact-lists/'):
            list_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            contact_list = contactlists_get_by_id(list_id)
            if contact_list:
                self.json_response(200, {'list': contact_list})
            else:
                self.json_response(404, {'error': 'Contact list not found'})
        elif path == '/api/email-tracking':
            self.json_response(200, {'stats': tracking_get()})

        elif path == '/api/whatsapp/config':
            # Return WhatsApp API configuration status (no secrets exposed)
            self.json_response(200, {
                'configured': bool(WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID),
                'hasAccessToken': bool(WA_ACCESS_TOKEN),
                'hasPhoneNumberId': bool(WA_PHONE_NUMBER_ID),
                'phoneNumberId': WA_PHONE_NUMBER_ID[-4:] if WA_PHONE_NUMBER_ID else '',
                'apiVersion': WA_API_VERSION,
                'brandName': WA_BRAND_NAME,
                'businessAccountId': WA_BUSINESS_ACCOUNT_ID[-4:] if WA_BUSINESS_ACCOUNT_ID else ''
            })

        elif path == '/api/whatsapp/message-log':
            # Return recent message send log
            try:
                logs = []
                if os.path.exists(MSG_LOG_FILE):
                    with open(MSG_LOG_FILE) as f:
                        logs = json.load(f)
                # Return last 50 entries
                self.json_response(200, {'logs': logs[-50:]})
            except Exception:
                self.json_response(200, {'logs': []})

        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_body()

        if path == '/api/flows':
            if not body.get('name'):
                self.json_response(400, {'error': 'name is required'})
                return
            flow = flows_save({
                'name': body['name'],
                'description': body.get('description', ''),
                'isActive': False,
                'nodes': body.get('nodes', []),
                'connections': body.get('connections', [])
            })
            self.json_response(201, {'flow': flow})

        elif path.endswith('/activate') and '/api/flows/' in path:
            flow_id = path.split('/')[3]
            flow = flows_get_by_id(flow_id)
            if not flow:
                self.json_response(404, {'error': 'Flow not found'})
                return
            flows_set_active(flow_id)
            self.json_response(200, {'success': True})

        elif path.endswith('/test') and '/api/flows/' in path:
            flow_id = path.split('/')[3]
            flow = flows_get_by_id(flow_id)
            if not flow:
                self.json_response(404, {'error': 'Flow not found'})
                return
            responses = simulate_flow(flow, body.get('message', 'hi'))
            self.json_response(200, {'responses': responses})

        elif path == '/api/messages/send':
            phone = body.get('phone', '')
            text = body.get('text', '')
            lead_name = body.get('leadName', '')
            csm_name = body.get('csmName', '')
            if not phone or not text:
                self.json_response(400, {'error': 'phone and text required'})
                return
            result = wa_send_text(
                phone, text,
                lead_name=lead_name,
                csm_name=csm_name
            )
            msg_id = None
            if result.get('messages'):
                msg_id = result['messages'][0].get('id')
            convs_create_or_get(phone, body.get('leadId'), body.get('leadName', ''))
            convs_add_message(phone, {
                'direction': 'outgoing',
                'type': 'text',
                'text': text,
                'status': 'sent',
                'waMessageId': msg_id
            })
            self.json_response(200, {'success': True, 'messageId': msg_id, **({} if not result.get('simulated') else {'simulated': True, 'note': result.get('error', '')})})

        elif path == '/api/messages/send-template':
            phone = body.get('phone', '')
            template_name = body.get('templateName', '')
            if not phone or not template_name:
                self.json_response(400, {'error': 'phone and templateName required'})
                return
            convs_create_or_get(phone, body.get('leadId'), body.get('leadName', ''))
            convs_add_message(phone, {
                'direction': 'outgoing',
                'type': 'template',
                'text': f'[Template: {template_name}]',
                'status': 'sent'
            })
            self.json_response(200, {'success': True, 'simulated': True})

        elif path == '/api/webhook':
            # WhatsApp incoming message webhook
            if body.get('object') != 'whatsapp_business_account':
                self.json_response(404, {'error': 'Not found'})
                return
            for entry in body.get('entry', []):
                for change in entry.get('changes', []):
                    value = change.get('value', {})
                    for msg in value.get('messages', []):
                        phone = msg.get('from', '')
                        contact = (value.get('contacts', [{}])[0]).get('profile', {})
                        contact_name = contact.get('name', '')
                        text = ''
                        if msg.get('type') == 'text':
                            text = msg.get('text', {}).get('body', '')
                        elif msg.get('type') == 'button':
                            text = msg.get('button', {}).get('text', '')
                        convs_add_message(phone, {
                            'direction': 'incoming',
                            'type': msg.get('type', 'text'),
                            'text': text or f"[{msg.get('type', 'unknown')}]",
                            'waMessageId': msg.get('id'),
                            'contactName': contact_name
                        })
                    for status in value.get('statuses', []):
                        conv = convs_get_by_phone(status.get('recipient_id', ''))
                        if conv:
                            for m in conv.get('messages', []):
                                if m.get('waMessageId') == status.get('id'):
                                    m['status'] = status.get('status', '')
                            convs_save(conv)
            self.json_response(200, {'status': 'ok'})

        # ─── Email Marketing POST endpoints ────────────────────
        elif path == '/api/campaigns':
            if not body.get('name'):
                self.json_response(400, {'error': 'name is required'})
                return
            campaign = campaigns_save({
                'name': body['name'],
                'subject': body.get('subject', ''),
                'templateId': body.get('templateId'),
                'contactListId': body.get('contactListId'),
                'status': 'draft',
                'stats': {'sent': 0, 'opened': 0, 'clicked': 0, 'bounced': 0}
            })
            self.json_response(201, {'campaign': campaign})

        elif path.endswith('/send') and '/api/campaigns/' in path:
            parts = path.split('/')
            campaign_id = parts[3] if len(parts) > 3 else ''
            campaign = campaigns_get_by_id(campaign_id)
            if not campaign:
                self.json_response(404, {'error': 'Campaign not found'})
                return
            now = datetime.utcnow().isoformat() + 'Z'
            campaign['status'] = 'sent'
            campaign['sentAt'] = now
            # Calculate sent count from contact list if available
            contact_list_id = campaign.get('contactListId')
            sent_count = 0
            if contact_list_id:
                cl = contactlists_get_by_id(contact_list_id)
                if cl:
                    sent_count = len(cl.get('contacts', []))
            campaign['stats']['sent'] = sent_count
            campaigns_save(campaign)
            tracking_update_campaign(campaign_id, campaign['stats'])
            self.json_response(200, {'campaign': campaign})

        elif path == '/api/email-templates':
            if not body.get('name'):
                self.json_response(400, {'error': 'name is required'})
                return
            template = templates_save({
                'name': body['name'],
                'subject': body.get('subject', ''),
                'htmlContent': body.get('htmlContent', ''),
                'isPrebuilt': body.get('isPrebuilt', False)
            })
            self.json_response(201, {'template': template})

        elif path == '/api/contact-lists':
            if not body.get('name'):
                self.json_response(400, {'error': 'name is required'})
                return
            contact_list = contactlists_save({
                'name': body['name'],
                'description': body.get('description', ''),
                'contacts': body.get('contacts', [])
            })
            self.json_response(201, {'contactList': contact_list})

        elif path == '/api/contacts/import':
            contacts = body.get('contacts', [])
            if not contacts:
                self.json_response(400, {'error': 'contacts array is required'})
                return
            auto_ack = body.get('autoAcknowledge', {})
            list_name = body.get('listName', 'Imported Contacts')
            created_leads = []
            acknowledged_count = 0
            now = datetime.utcnow().isoformat() + 'Z'
            for c in contacts:
                lead_id = 'lead_' + str(int(datetime.utcnow().timestamp() * 1000)) + '_' + uuid.uuid4().hex[:4]
                lead = {
                    'id': lead_id,
                    'name': c.get('name', ''),
                    'email': c.get('email', ''),
                    'phone': c.get('phone', ''),
                    'company': c.get('company', ''),
                    'jobTitle': c.get('jobTitle', ''),
                    'location': c.get('location', ''),
                    'source': c.get('source', 'import'),
                    'campaign': c.get('campaign', ''),
                    'status': c.get('status', 'New'),
                    'priority': c.get('priority', 'Medium'),
                    'assignedTo': c.get('assignedTo', ''),
                    'companySize': c.get('companySize', ''),
                    'industry': c.get('industry', ''),
                    'seniority': c.get('seniority', ''),
                    'createdAt': now,
                    'updatedAt': now
                }
                created_leads.append(lead)
                # Auto-acknowledge via WhatsApp if enabled and phone exists
                if auto_ack.get('enabled') and lead.get('phone'):
                    phone = sanitize_phone(lead['phone'])
                    if phone:
                        message_text = auto_ack.get('message', 'Hello! Thank you for your interest.')
                        # Replace placeholders in message
                        message_text = message_text.replace('{{name}}', lead.get('name', 'there'))
                        message_text = message_text.replace('{{Name}}', lead.get('name', 'there'))
                        message_text = message_text.replace('{{company}}', lead.get('company', ''))
                        message_text = message_text.replace('{{email}}', lead.get('email', ''))
                        wa_send_text(phone, message_text)
                        convs_create_or_get(phone, lead_id, lead.get('name', ''))
                        convs_add_message(phone, {
                            'direction': 'outgoing',
                            'type': 'text',
                            'text': message_text,
                            'status': 'sent'
                        })
                        acknowledged_count += 1
            # Also create a contact list from the imported contacts
            contactlists_save({
                'name': list_name,
                'description': f'Imported {len(created_leads)} contacts',
                'contacts': [{'name': l['name'], 'email': l['email'], 'phone': l.get('phone', '')} for l in created_leads]
            })
            self.json_response(201, {'leads': created_leads, 'count': len(created_leads), 'acknowledged': acknowledged_count})

        else:
            self.json_response(404, {'error': 'Not found'})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_body()

        if path.startswith('/api/flows/'):
            flow_id = path.split('/')[3]
            existing = flows_get_by_id(flow_id)
            if not existing:
                self.json_response(404, {'error': 'Flow not found'})
                return
            existing.update(body)
            existing['id'] = flow_id  # prevent ID override
            flows_save(existing)
            self.json_response(200, {'flow': existing})

        # ─── Email Marketing PUT endpoints ─────────────────────
        elif path.startswith('/api/campaigns/'):
            campaign_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            existing = campaigns_get_by_id(campaign_id)
            if not existing:
                self.json_response(404, {'error': 'Campaign not found'})
                return
            existing.update(body)
            existing['id'] = campaign_id  # prevent ID override
            campaigns_save(existing)
            self.json_response(200, {'campaign': existing})

        elif path.startswith('/api/email-templates/'):
            template_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            existing = templates_get_by_id(template_id)
            if not existing:
                self.json_response(404, {'error': 'Template not found'})
                return
            existing.update(body)
            existing['id'] = template_id  # prevent ID override
            templates_save(existing)
            self.json_response(200, {'template': existing})

        elif path.startswith('/api/contact-lists/'):
            list_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            existing = contactlists_get_by_id(list_id)
            if not existing:
                self.json_response(404, {'error': 'Contact list not found'})
                return
            existing.update(body)
            existing['id'] = list_id  # prevent ID override
            contactlists_save(existing)
            self.json_response(200, {'contactList': existing})

        else:
            self.json_response(404, {'error': 'Not found'})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/flows/'):
            flow_id = path.split('/')[3]
            if flows_delete(flow_id):
                self.json_response(200, {'success': True})
            else:
                self.json_response(404, {'error': 'Flow not found'})

        # ─── Email Marketing DELETE endpoints ──────────────────
        elif path.startswith('/api/campaigns/'):
            campaign_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            if campaigns_delete(campaign_id):
                self.json_response(200, {'success': True})
            else:
                self.json_response(404, {'error': 'Campaign not found'})

        elif path.startswith('/api/email-templates/'):
            template_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            if templates_delete(template_id):
                self.json_response(200, {'success': True})
            else:
                self.json_response(404, {'error': 'Template not found'})

        elif path.startswith('/api/contact-lists/'):
            list_id = path.split('/')[3] if len(path.split('/')) > 3 else ''
            if contactlists_delete(list_id):
                self.json_response(200, {'success': True})
            else:
                self.json_response(404, {'error': 'Contact list not found'})

        else:
            self.json_response(404, {'error': 'Not found'})

    def proxy_linkedin_api(self):
        try:
            req = urllib.request.Request(API_URL, headers={'User-Agent': 'SalesDashboard/1.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.json_response(502, {'error': str(e)})

    def json_response(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self._cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-auth-user')

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except Exception:
            return {}

    def end_headers(self):
        if not self._headers_buffer or b'Access-Control-Allow-Origin' not in b''.join(self._headers_buffer):
            self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress static file logs, show only API calls
        if '/api/' in str(args[0]) if args else False:
            super().log_message(format, *args)


if __name__ == '__main__':
    print('=' * 60)
    print('  Sales Dashboard + WhatsApp Marketing Platform')
    print('=' * 60)
    with http.server.HTTPServer(('', PORT), APIHandler) as httpd:
        print(f'  Dashboard:        http://localhost:{PORT}')
        print(f'  API proxy:        http://localhost:{PORT}/api/leads')
        print(f'  Webhook:          http://localhost:{PORT}/api/webhook')
        print(f'  Messages API:     http://localhost:{PORT}/api/messages/send')
        print(f'  WA Config:        http://localhost:{PORT}/api/whatsapp/config')
        print(f'  Message Log:      http://localhost:{PORT}/api/whatsapp/message-log')
        print(f'  Campaigns API:    http://localhost:{PORT}/api/campaigns')
        print(f'  Templates API:    http://localhost:{PORT}/api/email-templates')
        print(f'  Contact Lists:    http://localhost:{PORT}/api/contact-lists')
        print(f'  Email Tracking:   http://localhost:{PORT}/api/email-tracking')
        print(f'  Contact Import:   http://localhost:{PORT}/api/contacts/import')
        print('=' * 60)
        if WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID:
            print(f'  ✅ WhatsApp Brand: {WA_BRAND_NAME}')
            print(f'     Phone ID: ...{WA_PHONE_NUMBER_ID[-4:]} | API: {WA_API_VERSION}')
            print(f'     All messages sent from single {WA_BRAND_NAME} account')
        elif WA_ACCESS_TOKEN and not WA_PHONE_NUMBER_ID:
            print(f'  ⚠️  WhatsApp: ACCESS TOKEN set but PHONE_NUMBER_ID missing')
            print(f'     Add WHATSAPP_PHONE_NUMBER_ID to .env file')
        else:
            print(f'  ❌ WhatsApp: NOT CONFIGURED')
            print(f'     Create a .env file with:')
            print(f'       WHATSAPP_ACCESS_TOKEN=your_token_here')
            print(f'       WHATSAPP_PHONE_NUMBER_ID=your_phone_id_here')
            print(f'     Messages will be simulated until configured.')
        print('=' * 60)
        httpd.serve_forever()
