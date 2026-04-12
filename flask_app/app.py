import os
import hmac
import hashlib
import requests
from datetime import datetime, date
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "truck-admin-secret-2024")

# DB設定
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

MOBILE_API_KEY = os.environ.get("MOBILE_API_KEY", "truck-app-key")
ADMIN_INITIAL_PASSWORD = os.environ.get("ADMIN_INITIAL_PASSWORD", "admin123456")


# ─── DBモデル ───────────────────────────────────────────

class Admin(db.Model):
    __tablename__ = "admins"
    id = db.Column(db.Integer, primary_key=True)
    login_id = db.Column(db.String(100), nullable=False, unique=True)
    password_hash = db.Column(db.String(256), nullable=False)
    name = db.Column(db.String(100), nullable=False, default="管理者")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Truck(db.Model):
    __tablename__ = "trucks"
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(50), nullable=False, unique=True)  # 車両番号
    name = db.Column(db.String(100), nullable=False)                # 車両名称
    capacity = db.Column(db.String(50))                             # 積載量
    note = db.Column(db.Text)                                       # 備考
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "number": self.number,
            "name": self.name,
            "capacity": self.capacity,
            "note": self.note,
            "active": self.active,
        }


class Route(db.Model):
    __tablename__ = "routes"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)    # ルート名
    origin = db.Column(db.String(200))                  # 出発地
    destination = db.Column(db.String(200))             # 目的地
    distance_km = db.Column(db.Float)                   # 距離(km)
    note = db.Column(db.Text)                           # 備考
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "origin": self.origin,
            "destination": self.destination,
            "distance_km": self.distance_km,
            "note": self.note,
            "active": self.active,
        }


class Driver(db.Model):
    __tablename__ = "drivers"
    id = db.Column(db.Integer, primary_key=True)
    login_id = db.Column(db.String(100), nullable=False, unique=True)  # ログインID
    password_hash = db.Column(db.String(256), nullable=False)
    name = db.Column(db.String(100), nullable=False)    # 氏名
    phone = db.Column(db.String(20))                    # 電話番号
    license_number = db.Column(db.String(50))           # 免許番号
    note = db.Column(db.Text)                           # 備考
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "login_id": self.login_id,
            "name": self.name,
            "phone": self.phone,
            "license_number": self.license_number,
            "note": self.note,
            "active": self.active,
        }


class Operation(db.Model):
    __tablename__ = "operations"
    id = db.Column(db.Integer, primary_key=True)
    driver_id = db.Column(db.Integer, db.ForeignKey("drivers.id"), nullable=False)
    truck_id = db.Column(db.Integer, db.ForeignKey("trucks.id"), nullable=False)
    route_id = db.Column(db.Integer, db.ForeignKey("routes.id"))
    status = db.Column(db.String(20), default="off")
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    operation_date = db.Column(db.Date, default=date.today)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    driver = db.relationship("Driver", backref="operations")
    truck = db.relationship("Truck", backref="operations")
    route = db.relationship("Route", backref="operations")

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "driver_name": self.driver.name if self.driver else "-",
            "truck_id": self.truck_id,
            "truck_number": self.truck.number if self.truck else "-",
            "truck_name": self.truck.name if self.truck else "-",
            "route_id": self.route_id,
            "route_name": self.route.name if self.route else "-",
            "status": self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "operation_date": self.operation_date.isoformat() if self.operation_date else None,
            "note": self.note,
        }


class AppSettings(db.Model):
    __tablename__ = "app_settings"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), nullable=False, unique=True)
    value = db.Column(db.Text)

    @classmethod
    def get(cls, key, default=None):
        row = cls.query.filter_by(key=key).first()
        return row.value if row else default

    @classmethod
    def set(cls, key, value):
        row = cls.query.filter_by(key=key).first()
        if row:
            row.value = value
        else:
            row = cls(key=key, value=value)
            db.session.add(row)
        db.session.commit()


# ─── ヘルパー ────────────────────────────────────────────

def admin_login(login_id, password):
    """管理者ローカル認証"""
    from werkzeug.security import check_password_hash
    admin = Admin.query.filter_by(login_id=login_id).first()
    if admin and check_password_hash(admin.password_hash, password):
        return {"ok": True, "staff_token": f"admin:{admin.id}", "staff_id": admin.id, "name": admin.name}
    return {"ok": False, "error": "ログインIDまたはパスワードが正しくありません"}


def make_driver_token(driver_id):
    """ドライバー用トークン生成"""
    secret = MOBILE_API_KEY
    payload = f"{driver_id}:driver:local"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


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
        fmt = "%Y-%m-%dT%H:%M:%S" if "T" in str(start_str) else "%Y-%m-%d %H:%M:%S"
        start = datetime.strptime(str(start_str)[:19], fmt)
        end = datetime.strptime(str(end_str)[:19], fmt) if end_str else datetime.now()
        mins = int((end - start).total_seconds() / 60)
        if mins < 60:
            return f"{mins}分"
        return f"{mins // 60}時間{mins % 60}分"
    except Exception:
        return "-"


def format_time(dt_val):
    if not dt_val:
        return "-"
    try:
        if isinstance(dt_val, datetime):
            return dt_val.strftime("%H:%M")
        dt_str = str(dt_val)
        fmt = "%Y-%m-%dT%H:%M:%S" if "T" in dt_str else "%Y-%m-%d %H:%M:%S"
        dt = datetime.strptime(dt_str[:19], fmt)
        return dt.strftime("%H:%M")
    except Exception:
        return str(dt_val)


app.jinja_env.globals.update(
    format_status=format_status,
    status_color=status_color,
    calc_duration=calc_duration,
    format_time=format_time,
)


# ─── 認証ルート ──────────────────────────────────────────

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
        result = admin_login(login_id, password)
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


# ─── ダッシュボード ──────────────────────────────────────

@app.route("/dashboard")
@login_required
def dashboard():
    today = date.today()
    operations = Operation.query.filter_by(operation_date=today).all()
    trucks = Truck.query.filter_by(active=True).all()
    drivers = Driver.query.filter_by(active=True).all()

    status_counts = {}
    for op in operations:
        s = op.status or "off"
        status_counts[s] = status_counts.get(s, 0) + 1

    today_str = today.strftime("%Y年%m月%d日")
    return render_template(
        "admin/dashboard.html",
        operations=operations,
        trucks=trucks,
        drivers=drivers,
        status_counts=status_counts,
        today_str=today_str,
        error=None,
    )


# ─── 運行履歴 ────────────────────────────────────────────

@app.route("/history")
@login_required
def history():
    now = datetime.now()
    year = int(request.args.get("year", now.year))
    month = int(request.args.get("month", now.month))
    driver_id = request.args.get("driver_id", "")
    truck_id = request.args.get("truck_id", "")

    query = Operation.query.filter(
        db.extract("year", Operation.operation_date) == year,
        db.extract("month", Operation.operation_date) == month,
    )
    if driver_id:
        query = query.filter(Operation.driver_id == int(driver_id))
    if truck_id:
        query = query.filter(Operation.truck_id == int(truck_id))

    operations = query.order_by(Operation.operation_date.desc()).all()
    trucks = Truck.query.filter_by(active=True).all()
    drivers = Driver.query.filter_by(active=True).all()

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
        error=None,
    )


# ─── トラック管理 ────────────────────────────────────────

@app.route("/trucks")
@login_required
def trucks():
    trucks_list = Truck.query.order_by(Truck.created_at.desc()).all()
    return render_template("admin/trucks.html", trucks=trucks_list, error=None)


@app.route("/trucks/new", methods=["GET", "POST"])
@login_required
def truck_new():
    if request.method == "POST":
        number = request.form.get("number", "").strip()
        name = request.form.get("name", "").strip()
        capacity = request.form.get("capacity", "").strip()
        note = request.form.get("note", "").strip()
        if not number or not name:
            flash("車両番号と車両名称は必須です", "error")
            return render_template("admin/truck_form.html", truck=None, action="new")
        existing = Truck.query.filter_by(number=number).first()
        if existing:
            flash("その車両番号はすでに登録されています", "error")
            return render_template("admin/truck_form.html", truck=None, action="new")
        truck = Truck(number=number, name=name, capacity=capacity, note=note)
        db.session.add(truck)
        db.session.commit()
        flash(f"トラック「{name}」を登録しました", "success")
        return redirect(url_for("trucks"))
    return render_template("admin/truck_form.html", truck=None, action="new")


@app.route("/trucks/<int:truck_id>/edit", methods=["GET", "POST"])
@login_required
def truck_edit(truck_id):
    truck = Truck.query.get_or_404(truck_id)
    if request.method == "POST":
        truck.number = request.form.get("number", "").strip()
        truck.name = request.form.get("name", "").strip()
        truck.capacity = request.form.get("capacity", "").strip()
        truck.note = request.form.get("note", "").strip()
        truck.active = request.form.get("active") == "1"
        if not truck.number or not truck.name:
            flash("車両番号と車両名称は必須です", "error")
            return render_template("admin/truck_form.html", truck=truck, action="edit")
        db.session.commit()
        flash(f"トラック「{truck.name}」を更新しました", "success")
        return redirect(url_for("trucks"))
    return render_template("admin/truck_form.html", truck=truck, action="edit")


@app.route("/trucks/<int:truck_id>/delete", methods=["POST"])
@login_required
def truck_delete(truck_id):
    truck = Truck.query.get_or_404(truck_id)
    truck.active = False
    db.session.commit()
    flash(f"トラック「{truck.name}」を無効化しました", "success")
    return redirect(url_for("trucks"))


# ─── ルート管理 ──────────────────────────────────────────

@app.route("/routes")
@login_required
def routes():
    routes_list = Route.query.order_by(Route.created_at.desc()).all()
    return render_template("admin/routes.html", routes=routes_list, error=None)


@app.route("/routes/new", methods=["GET", "POST"])
@login_required
def route_new():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        origin = request.form.get("origin", "").strip()
        destination = request.form.get("destination", "").strip()
        distance_km = request.form.get("distance_km", "").strip()
        note = request.form.get("note", "").strip()
        if not name:
            flash("ルート名は必須です", "error")
            return render_template("admin/route_form.html", route=None, action="new")
        route = Route(
            name=name,
            origin=origin,
            destination=destination,
            distance_km=float(distance_km) if distance_km else None,
            note=note,
        )
        db.session.add(route)
        db.session.commit()
        flash(f"ルート「{name}」を登録しました", "success")
        return redirect(url_for("routes"))
    return render_template("admin/route_form.html", route=None, action="new")


@app.route("/routes/<int:route_id>/edit", methods=["GET", "POST"])
@login_required
def route_edit(route_id):
    route = Route.query.get_or_404(route_id)
    if request.method == "POST":
        route.name = request.form.get("name", "").strip()
        route.origin = request.form.get("origin", "").strip()
        route.destination = request.form.get("destination", "").strip()
        distance_km = request.form.get("distance_km", "").strip()
        route.distance_km = float(distance_km) if distance_km else None
        route.note = request.form.get("note", "").strip()
        route.active = request.form.get("active") == "1"
        if not route.name:
            flash("ルート名は必須です", "error")
            return render_template("admin/route_form.html", route=route, action="edit")
        db.session.commit()
        flash(f"ルート「{route.name}」を更新しました", "success")
        return redirect(url_for("routes"))
    return render_template("admin/route_form.html", route=route, action="edit")


@app.route("/routes/<int:route_id>/delete", methods=["POST"])
@login_required
def route_delete(route_id):
    route = Route.query.get_or_404(route_id)
    route.active = False
    db.session.commit()
    flash(f"ルート「{route.name}」を無効化しました", "success")
    return redirect(url_for("routes"))


# ─── ドライバー管理 ──────────────────────────────────────

@app.route("/drivers")
@login_required
def drivers():
    drivers_list = Driver.query.order_by(Driver.created_at.desc()).all()
    return render_template("admin/drivers.html", drivers=drivers_list, error=None)


@app.route("/drivers/new", methods=["GET", "POST"])
@login_required
def driver_new():
    if request.method == "POST":
        from werkzeug.security import generate_password_hash
        login_id = request.form.get("login_id", "").strip()
        password = request.form.get("password", "").strip()
        name = request.form.get("name", "").strip()
        phone = request.form.get("phone", "").strip()
        license_number = request.form.get("license_number", "").strip()
        note = request.form.get("note", "").strip()
        if not login_id or not password or not name:
            flash("ログインID・パスワード・氏名は必須です", "error")
            return render_template("admin/driver_form.html", driver=None, action="new")
        existing = Driver.query.filter_by(login_id=login_id).first()
        if existing:
            flash("そのログインIDはすでに登録されています", "error")
            return render_template("admin/driver_form.html", driver=None, action="new")
        driver = Driver(
            login_id=login_id,
            password_hash=generate_password_hash(password),
            name=name,
            phone=phone,
            license_number=license_number,
            note=note,
        )
        db.session.add(driver)
        db.session.commit()
        flash(f"ドライバー「{name}」を登録しました", "success")
        return redirect(url_for("drivers"))
    return render_template("admin/driver_form.html", driver=None, action="new")


@app.route("/drivers/<int:driver_id>/edit", methods=["GET", "POST"])
@login_required
def driver_edit(driver_id):
    from werkzeug.security import generate_password_hash
    driver = Driver.query.get_or_404(driver_id)
    if request.method == "POST":
        driver.login_id = request.form.get("login_id", "").strip()
        driver.name = request.form.get("name", "").strip()
        driver.phone = request.form.get("phone", "").strip()
        driver.license_number = request.form.get("license_number", "").strip()
        driver.note = request.form.get("note", "").strip()
        driver.active = request.form.get("active") == "1"
        new_password = request.form.get("password", "").strip()
        if new_password:
            driver.password_hash = generate_password_hash(new_password)
        if not driver.login_id or not driver.name:
            flash("ログインIDと氏名は必須です", "error")
            return render_template("admin/driver_form.html", driver=driver, action="edit")
        db.session.commit()
        flash(f"ドライバー「{driver.name}」を更新しました", "success")
        return redirect(url_for("drivers"))
    return render_template("admin/driver_form.html", driver=driver, action="edit")


@app.route("/drivers/<int:driver_id>/delete", methods=["POST"])
@login_required
def driver_delete(driver_id):
    driver = Driver.query.get_or_404(driver_id)
    driver.active = False
    db.session.commit()
    flash(f"ドライバー「{driver.name}」を無効化しました", "success")
    return redirect(url_for("drivers"))


# ─── モバイルAPI（ドライバーアプリ向け）────────────────────

@app.route("/api/mobile/auth/login", methods=["POST"])
def mobile_login():
    """ドライバーアプリ用ログイン"""
    api_key = request.headers.get("X-Mobile-API-Key", "")
    if not hmac.compare_digest(api_key, MOBILE_API_KEY):
        return jsonify({"ok": False, "error": "APIキーが無効です"}), 401
    from werkzeug.security import check_password_hash
    data = request.get_json(silent=True) or {}
    login_id = data.get("login_id", "").strip()
    password = data.get("password", "")
    if not login_id or not password:
        return jsonify({"ok": False, "error": "login_idとpasswordは必須です"}), 400
    driver = Driver.query.filter_by(login_id=login_id, active=True).first()
    if not driver or not check_password_hash(driver.password_hash, password):
        return jsonify({"ok": False, "error": "ログインIDまたはパスワードが正しくありません"}), 401
    token = make_driver_token(driver.id)
    return jsonify({"ok": True, "staff_token": token, "staff_id": driver.id, "staff_type": "driver", "name": driver.name})


@app.route("/api/mobile/trucks", methods=["GET"])
def mobile_trucks():
    api_key = request.headers.get("X-Mobile-API-Key", "")
    if not hmac.compare_digest(api_key, MOBILE_API_KEY):
        return jsonify({"ok": False, "error": "APIキーが無効です"}), 401
    trucks = Truck.query.filter_by(active=True).all()
    return jsonify({"ok": True, "trucks": [t.to_dict() for t in trucks]})


@app.route("/api/mobile/routes", methods=["GET"])
def mobile_routes():
    api_key = request.headers.get("X-Mobile-API-Key", "")
    if not hmac.compare_digest(api_key, MOBILE_API_KEY):
        return jsonify({"ok": False, "error": "APIキーが無効です"}), 401
    routes = Route.query.filter_by(active=True).all()
    return jsonify({"ok": True, "routes": [r.to_dict() for r in routes]})


@app.route("/api/mobile/operation/start", methods=["POST"])
def mobile_operation_start():
    api_key = request.headers.get("X-Mobile-API-Key", "")
    if not hmac.compare_digest(api_key, MOBILE_API_KEY):
        return jsonify({"ok": False, "error": "APIキーが無効です"}), 401
    data = request.get_json(silent=True) or {}
    driver_id = data.get("driver_id")
    truck_id = data.get("truck_id")
    route_id = data.get("route_id")
    if not driver_id or not truck_id:
        return jsonify({"ok": False, "error": "driver_idとtruck_idは必須です"}), 400
    op = Operation(
        driver_id=driver_id,
        truck_id=truck_id,
        route_id=route_id,
        status="driving",
        start_time=datetime.now(),
        operation_date=date.today(),
    )
    db.session.add(op)
    db.session.commit()
    return jsonify({"ok": True, "operation_id": op.id})


@app.route("/api/mobile/operation/status", methods=["POST"])
def mobile_operation_status():
    api_key = request.headers.get("X-Mobile-API-Key", "")
    if not hmac.compare_digest(api_key, MOBILE_API_KEY):
        return jsonify({"ok": False, "error": "APIキーが無効です"}), 401
    data = request.get_json(silent=True) or {}
    operation_id = data.get("operation_id")
    status = data.get("status")
    if not operation_id or not status:
        return jsonify({"ok": False, "error": "operation_idとstatusは必須です"}), 400
    op = Operation.query.get(operation_id)
    if not op:
        return jsonify({"ok": False, "error": "運行記録が見つかりません"}), 404
    op.status = status
    if status == "finished":
        op.end_time = datetime.now()
    db.session.commit()
    return jsonify({"ok": True})


# ─── ドライバーマイページ ──────────────────────────────────

def driver_login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "driver_id" not in session:
            return redirect(url_for("driver_login"))
        return f(*args, **kwargs)
    return decorated


@app.route("/driver/login", methods=["GET", "POST"])
def driver_login():
    from werkzeug.security import check_password_hash
    error = None
    if request.method == "POST":
        login_id = request.form.get("login_id", "").strip()
        password = request.form.get("password", "")
        driver = Driver.query.filter_by(login_id=login_id, active=True).first()
        if driver and check_password_hash(driver.password_hash, password):
            session["driver_id"] = driver.id
            session["driver_name"] = driver.name
            return redirect(url_for("driver_dashboard"))
        else:
            error = "ログインIDまたはパスワードが正しくありません"
    return render_template("driver/login.html", error=error)


@app.route("/driver/logout")
def driver_logout():
    session.pop("driver_id", None)
    session.pop("driver_name", None)
    return redirect(url_for("driver_login"))


@app.route("/driver/dashboard")
@driver_login_required
def driver_dashboard():
    driver_id = session["driver_id"]
    driver = Driver.query.get(driver_id)
    today = date.today()
    today_str = today.strftime("%Y年%m月%d日")
    operations = Operation.query.filter_by(
        driver_id=driver_id,
        operation_date=today
    ).order_by(Operation.start_time).all()
    apk_url = AppSettings.get("android_apk_url", "")
    apk_version = AppSettings.get("android_apk_version", "")
    return render_template(
        "driver/dashboard.html",
        driver=driver,
        today_str=today_str,
        operations=operations,
        apk_url=apk_url,
        apk_version=apk_version,
    )


@app.route("/driver/apk_download")
@driver_login_required
def driver_apk_download():
    apk_url = AppSettings.get("android_apk_url", "")
    if not apk_url:
        return "APKが設定されていません", 404
    try:
        resp = requests.get(apk_url, stream=True, timeout=30)
        from flask import Response, stream_with_context
        def generate():
            for chunk in resp.iter_content(chunk_size=8192):
                yield chunk
        filename = "truck-operation-app.apk"
        return Response(
            stream_with_context(generate()),
            content_type="application/vnd.android.package-archive",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        return f"ダウンロードエラー: {e}", 500


# ─── APK設定（管理者）──────────────────────────────────────

@app.route("/settings/apk", methods=["GET", "POST"])
@login_required
def apk_settings():
    if request.method == "POST":
        apk_url = request.form.get("apk_url", "").strip()
        apk_version = request.form.get("apk_version", "").strip()
        AppSettings.set("android_apk_url", apk_url)
        AppSettings.set("android_apk_version", apk_version)
        flash("APK設定を保存しました", "success")
        return redirect(url_for("apk_settings"))
    apk_url = AppSettings.get("android_apk_url", "")
    apk_version = AppSettings.get("android_apk_version", "")
    return render_template("admin/apk_settings.html", apk_url=apk_url, apk_version=apk_version)


# ─── DB初期化 ────────────────────────────────────────────

@app.cli.command("init-db")
def init_db():
    db.create_all()
    print("DB initialized.")


with app.app_context():
    try:
        db.create_all()
        # 管理者アカウントが存在しない場合は初期アカウントを作成
        from werkzeug.security import generate_password_hash
        if Admin.query.count() == 0:
            admin = Admin(
                login_id="admin",
                password_hash=generate_password_hash(ADMIN_INITIAL_PASSWORD),
                name="管理者",
            )
            db.session.add(admin)
            db.session.commit()
            print(f"初期管理者アカウントを作成しました: admin / {ADMIN_INITIAL_PASSWORD}")
    except Exception as e:
        print(f"DB init error: {e}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
