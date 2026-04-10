import os
import hmac
import json
import requests
from datetime import datetime, date
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "truck-admin-secret-2024")

# VPS APIの設定
VPS_API_URL = os.environ.get("VPS_API_URL", "https://samurai-hub.com")
MOBILE_API_KEY = os.environ.get("MOBILE_API_KEY", "truck-app-key")
TENANT_SLUG = os.environ.get("TENANT_SLUG", "zeioks")


def vps_request(path, method="GET", data=None, staff_token=None):
    """VPS APIへのリクエスト"""
    url = f"{VPS_API_URL}/api/mobile{path}"
    headers = {
        "Content-Type": "application/json",
        "X-Mobile-API-Key": MOBILE_API_KEY,
    }
    if staff_token:
        headers["X-Staff-Token"] = staff_token
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=10)
        else:
            resp = requests.post(url, headers=headers, json=data, timeout=10)
        return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "staff_token" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


def format_status(status):
    mapping = {
        "off": "未出発",
        "driving": "運行中",
        "break": "休憩中",
        "loading": "荷積み中",
        "unloading": "荷下ろし中",
        "finished": "運行終了",
    }
    return mapping.get(status, status)


def status_color(status):
    mapping = {
        "off": "#6b7280",
        "driving": "#16a34a",
        "break": "#d97706",
        "loading": "#2563eb",
        "unloading": "#7c3aed",
        "finished": "#dc2626",
    }
    return mapping.get(status, "#6b7280")


def calc_duration(start_str, end_str=None):
    if not start_str:
        return "-"
    try:
        fmt = "%Y-%m-%dT%H:%M:%S" if "T" in start_str else "%Y-%m-%d %H:%M:%S"
        start = datetime.strptime(start_str[:19], fmt)
        end = datetime.strptime(end_str[:19], fmt) if end_str else datetime.now()
        mins = int((end - start).total_seconds() / 60)
        if mins < 60:
            return f"{mins}分"
        return f"{mins // 60}時間{mins % 60}分"
    except Exception:
        return "-"


def format_time(dt_str):
    if not dt_str:
        return "-"
    try:
        fmt = "%Y-%m-%dT%H:%M:%S" if "T" in dt_str else "%Y-%m-%d %H:%M:%S"
        dt = datetime.strptime(dt_str[:19], fmt)
        return dt.strftime("%H:%M")
    except Exception:
        return dt_str


app.jinja_env.globals.update(
    format_status=format_status,
    status_color=status_color,
    calc_duration=calc_duration,
    format_time=format_time,
)


@app.route("/")
@login_required
def index():
    return redirect(url_for("dashboard"))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        login_id = request.form.get("login_id", "").strip()
        password = request.form.get("password", "")
        result = vps_request("/auth/login", method="POST", data={
            "login_id": login_id,
            "password": password,
            "tenant_slug": TENANT_SLUG,
        })
        if result.get("ok"):
            session["staff_token"] = result["staff_token"]
            session["staff_id"] = result["staff_id"]
            session["staff_name"] = result.get("name", "管理者")
            session["tenant_id"] = result.get("tenant_id")
            return redirect(url_for("dashboard"))
        else:
            error = result.get("error", "ログインに失敗しました")
    return render_template("admin/login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    token = session["staff_token"]
    ops_result = vps_request("/admin/operations/today", staff_token=token)
    trucks_result = vps_request("/trucks", staff_token=token)
    drivers_result = vps_request("/drivers", staff_token=token)

    operations = ops_result.get("operations", []) if ops_result.get("ok") else []
    trucks = trucks_result.get("trucks", []) if trucks_result.get("ok") else []
    drivers = drivers_result.get("drivers", []) if drivers_result.get("ok") else []

    # ステータス別集計
    status_counts = {}
    for op in operations:
        s = op.get("status", "off")
        status_counts[s] = status_counts.get(s, 0) + 1

    today_str = date.today().strftime("%Y年%m月%d日")
    return render_template(
        "admin/dashboard.html",
        operations=operations,
        trucks=trucks,
        drivers=drivers,
        status_counts=status_counts,
        today_str=today_str,
        error=None if ops_result.get("ok") else ops_result.get("error"),
    )


@app.route("/history")
@login_required
def history():
    token = session["staff_token"]
    now = datetime.now()
    year = int(request.args.get("year", now.year))
    month = int(request.args.get("month", now.month))
    driver_id = request.args.get("driver_id", "")
    truck_id = request.args.get("truck_id", "")

    params = f"?year={year}&month={month}"
    if driver_id:
        params += f"&driver_id={driver_id}"
    if truck_id:
        params += f"&truck_id={truck_id}"

    ops_result = vps_request(f"/admin/operations/history{params}", staff_token=token)
    trucks_result = vps_request("/trucks", staff_token=token)
    drivers_result = vps_request("/drivers", staff_token=token)

    operations = ops_result.get("operations", []) if ops_result.get("ok") else []
    trucks = trucks_result.get("trucks", []) if trucks_result.get("ok") else []
    drivers = drivers_result.get("drivers", []) if drivers_result.get("ok") else []

    years = [now.year - 1, now.year]
    months = list(range(1, 13))

    return render_template(
        "admin/history.html",
        operations=operations,
        trucks=trucks,
        drivers=drivers,
        selected_year=year,
        selected_month=month,
        selected_driver_id=driver_id,
        selected_truck_id=truck_id,
        years=years,
        months=months,
        error=None if ops_result.get("ok") else ops_result.get("error"),
    )


@app.route("/trucks")
@login_required
def trucks():
    token = session["staff_token"]
    result = vps_request("/trucks", staff_token=token)
    trucks_list = result.get("trucks", []) if result.get("ok") else []
    return render_template(
        "admin/trucks.html",
        trucks=trucks_list,
        error=None if result.get("ok") else result.get("error"),
    )


@app.route("/drivers")
@login_required
def drivers():
    token = session["staff_token"]
    result = vps_request("/drivers", staff_token=token)
    drivers_list = result.get("drivers", []) if result.get("ok") else []
    return render_template(
        "admin/drivers.html",
        drivers=drivers_list,
        error=None if result.get("ok") else result.get("error"),
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
