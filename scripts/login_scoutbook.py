#!/usr/bin/env python3
import time
import json
import subprocess
import os
import base64
from pathlib import Path

# Configuration matching Scouts-CLI
SCOUTS_HOME = Path.home() / ".scouts-cli"
BROWSER_PROFILE = SCOUTS_HOME / "browser-profile"
LOGIN_URL = "https://advancements.scouting.org/login"
API_BASE = "https://api.scouting.org"
# Base64 of 'https://advancements.scouting.org/roster'
ESB_URL = "aHR0cHM6Ly9hZHZhbmNlbWVudHMuc2NvdXRpbmcub3JnL3Jvc3Rlcg=="

def check_playwright():
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        print("\n❌ Playwright is not installed. To fix this, run:")
        print("   pip install playwright && playwright install chromium")
        return False

def check_requests():
    try:
        import requests
        return True
    except ImportError:
        print("\n❌ Requests is not installed. To fix this, run:")
        print("   pip install requests")
        return False

def copy_to_clipboard(text):
    try:
        process = subprocess.Popen(['pbcopy'], stdin=subprocess.PIPE)
        process.communicate(input=text.encode('utf-8'))
        return True
    except Exception as e:
        print(f"Error copying to clipboard: {e}")
        return False

def decode_jwt(token):
    try:
        _, payload_b64, _ = token.split('.')
        # Add padding if necessary
        missing_padding = len(payload_b64) % 4
        if missing_padding:
            payload_b64 += '=' * (4 - missing_padding)
        payload_json = base64.b64decode(payload_b64).decode('utf-8')
        return json.loads(payload_json)
    except Exception as e:
        print(f"Error decoding JWT: {e}")
        return None

def fetch_units(token, user_id):
    import requests
    headers = {
        "Authorization": f"Bearer {token}",
        "x-esb-url": ESB_URL,
        "Accept": "application/json",
    }
    
    units = []
    seen_guids = set()

    def add_unit(org):
        guid = org.get('organizationGuid') or org.get('orgGuid')
        if guid and guid not in seen_guids:
            name = f"{org.get('unitType', 'Unit')} {org.get('unitNumber', org.get('number', ''))}".strip()
            units.append({"guid": guid, "name": name})
            seen_guids.add(guid)

    try:
        # 1. Fetch from Person Profile
        profile_res = requests.get(f"{API_BASE}/persons/v2/{user_id}/personprofile", headers=headers)
        if profile_res.ok:
            positions = profile_res.json().get('organizationPositions', [])
            for pos in positions:
                add_unit(pos)
        
        # 2. Fetch from My Scouts
        scouts_res = requests.get(f"{API_BASE}/persons/{user_id}/myScout", headers=headers)
        if scouts_res.ok:
            scouts = scouts_res.json()
            if isinstance(scouts, list):
                for s in scouts:
                    add_unit(s)
    except Exception as e:
        print(f"Error fetching units: {e}")

    return units

def main():
    if not check_playwright() or not check_requests():
        return

    from playwright.sync_api import sync_playwright

    SCOUTS_HOME.mkdir(parents=True, exist_ok=True)
    BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)

    print(f"🚀 Launching Scoutbook Login (Persistent Session: {BROWSER_PROFILE})")
    
    token = None
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            str(BROWSER_PROFILE),
            headless=False,
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()
        try:
            page.goto("https://advancements.scouting.org/")
            page.evaluate("localStorage.removeItem('LOGIN_DATA')")
        except:
            pass
            
        page.goto(LOGIN_URL)

        print("\n🕒 Waiting for session...")
        start_time = time.time()
        while time.time() - start_time < 300: # 5 minutes
            data_raw = page.evaluate("localStorage.getItem('LOGIN_DATA')")
            if data_raw:
                try:
                    data = json.loads(data_raw)
                    token = data.get('token')
                    if token:
                        break
                except:
                    pass
            time.sleep(1)
        context.close()

    if not token:
        print("\n❌ Timed out waiting for login.")
        return

    # Now discover units
    payload = decode_jwt(token)
    user_id = payload.get('uid')
    if not user_id:
        print("\n❌ Token format invalid (missing 'uid').")
        return

    print("\n🔍 Fetching your units...")
    units = fetch_units(token, user_id)

    if not units:
        print("\n❌ No units found for this account.")
        # Fallback to copy just the token
        copy_to_clipboard(token)
        print("✅ Token copied to clipboard (Manual entry required for Unit ID).")
        return

    print("\nSelect your unit:")
    for i, u in enumerate(units, 1):
        print(f"  {i}. {u['name']} (GUID: {u['guid'][:8]}...)")
    
    choice = input(f"\nEnter choice (1-{len(units)}): ")
    try:
        idx = int(choice) - 1
        selected_unit = units[idx]
        
        # Package for Smart Paste
        result = json.dumps({
            "token": token,
            "unitId": selected_unit['guid'],
            "unitName": selected_unit['name']
        })
        
        if copy_to_clipboard(result):
            print(f"\n✅ SUCCESS! Token + {selected_unit['name']} copied to clipboard.")
            print("Now paste it into Troop Velocity Tracker.")
        else:
            print(f"\n✅ Result: {result}")

    except (ValueError, IndexError):
        print("\n❌ Invalid choice. Copying token only.")
        copy_to_clipboard(token)
        print("✅ Token copied.")

if __name__ == "__main__":
    main()
