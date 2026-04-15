import json
import os
import sys


def normalize_phone(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""

    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return ""

    return f"+{digits}"


def as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def main() -> int:
    env_phone = os.getenv("PYWHATKIT_PHONE", "")
    env_message = os.getenv("PYWHATKIT_MESSAGE", "")

    if len(sys.argv) >= 3:
        phone = normalize_phone(sys.argv[1])
        message = str(sys.argv[2] or "").strip()
    else:
        phone = normalize_phone(env_phone)
        message = str(env_message or "").strip()

    if not phone and not message:
        print(json.dumps({
            "status": "failed",
            "provider": "pywhatkit-whatsapp",
            "error_message": "Uso: python send_whatsapp_pywhatkit.py <phone> <message>"
        }))
        return 1

    if not phone:
        print(json.dumps({
            "status": "failed",
            "provider": "pywhatkit-whatsapp",
            "error_message": "Telefono invalido para PyWhatKit"
        }))
        return 1

    if not message:
        print(json.dumps({
            "status": "failed",
            "provider": "pywhatkit-whatsapp",
            "error_message": "Mensaje vacio"
        }))
        return 1

    if as_bool(os.getenv("PYWHATKIT_DRY_RUN"), False):
        print(json.dumps({
            "status": "sent",
            "provider": "pywhatkit-whatsapp",
            "recipient": phone,
            "message_body": message,
            "dry_run": True
        }))
        return 0

    wait_time = int(os.getenv("PYWHATKIT_WAIT_TIME", "20"))
    tab_close = as_bool(os.getenv("PYWHATKIT_CLOSE_TAB"), True)
    close_time = int(os.getenv("PYWHATKIT_CLOSE_TIME", "3"))

    try:
        import pywhatkit

        pywhatkit.sendwhatmsg_instantly(
            phone,
            message,
            wait_time=wait_time,
            tab_close=tab_close,
            close_time=close_time
        )

        print(json.dumps({
            "status": "sent",
            "provider": "pywhatkit-whatsapp",
            "recipient": phone,
            "message_body": message
        }))
        return 0
    except Exception as exc:
        print(json.dumps({
            "status": "failed",
            "provider": "pywhatkit-whatsapp",
            "error_message": str(exc)
        }))
        return 1


if __name__ == "__main__":
    sys.exit(main())
