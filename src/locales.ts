// UI messages. Chinese source strings are stable keys; interpolation uses {0}, {1}, …
export const translations: Record<string, { en: string; es: string }> = {
  "系统 Shell": {"en":"System shell","es":"Shell del sistema"},
  "应用界面与运行版本不一致，请完全退出并重新启动小助手。": {"en":"The interface and running app versions do not match. Fully quit and restart Assistant.","es":"La interfaz y la aplicación en ejecución tienen versiones distintas. Cierra por completo el asistente y vuelve a iniciarlo."},
  "终端正在加载，请稍候": {"en":"Terminal is loading. Please wait.","es":"El terminal se está cargando. Espera un momento."},
  "终端": {"en":"Terminal","es":"Terminal"},
  "本地终端与 SSH": {"en":"Local terminals and SSH","es":"Terminales locales y SSH"},
  "终端设置": {"en":"Terminal settings","es":"Ajustes del terminal"},
  "会话": {"en":"Sessions","es":"Sesiones"},
  "连接中…": {"en":"Connecting…","es":"Conectando…"},
  "已连接": {"en":"Connected","es":"Conectado"},
  "连接失败": {"en":"Connection failed","es":"Error de conexión"},
  "已结束": {"en":"Ended","es":"Finalizado"},
  "新建会话": {"en":"New session","es":"Nueva sesión"},
  "编辑连接": {"en":"Edit connection","es":"Editar conexión"},
  "清除保存的凭据": {"en":"Forget saved credentials","es":"Borrar credenciales guardadas"},
  "删除连接": {"en":"Delete connection","es":"Eliminar conexión"},
  "新建终端": {"en":"New terminal","es":"Nuevo terminal"},
  "本地终端": {"en":"Local terminal","es":"Terminal local"},
  "SSH 连接": {"en":"SSH connection","es":"Conexión SSH"},
  "搜索会话或连接": {"en":"Search sessions or connections","es":"Buscar sesiones o conexiones"},
  "本地": {"en":"Local","es":"Local"},
  "远程": {"en":"Remote","es":"Remoto"},
  "点击加号创建第一个终端": {"en":"Use + to create your first terminal","es":"Usa + para crear tu primer terminal"},
  "开发环境": {"en":"Development","es":"Desarrollo"},
  "测试环境": {"en":"Test","es":"Pruebas"},
  "生产环境": {"en":"Production","es":"Producción"},
  "本地与远程工作空间": {"en":"Local and remote workspaces","es":"Espacios de trabajo locales y remotos"},
  "从这里连接你的工作环境": {"en":"Connect to your workspace","es":"Conecta con tu entorno de trabajo"},
  "创建本地终端，或通过 SSH 连接服务器。": {"en":"Create a local terminal or connect to a server over SSH.","es":"Crea un terminal local o conecta a un servidor por SSH."},
  "加载中…": {"en":"Loading…","es":"Cargando…"},
  "远程文件": {"en":"Remote files","es":"Archivos remotos"},
  "认证凭据保存在本机，不进入 AI 对话": {"en":"Credentials stay on this computer, outside AI chats","es":"Las credenciales permanecen en este equipo, fuera del chat con IA"},
  "个连接": {"en":"connections","es":"conexiones"},
  "会话已结束": {"en":"Session ended","es":"Sesión finalizada"},
  "正在核对服务器指纹…": {"en":"Checking the server fingerprint…","es":"Comprobando la huella del servidor…"},
  "服务器指纹发生变化，请先通过可信渠道核对。": {"en":"The server fingerprint changed. Verify it through a trusted channel first.","es":"La huella del servidor cambió. Verifícala primero por un canal de confianza."},
  "首次连接，请通过可信渠道核对服务器指纹。": {"en":"First connection: verify the fingerprint through a trusted channel.","es":"Primera conexión: verifica la huella por un canal de confianza."},
  "原指纹": {"en":"Previous fingerprint","es":"Huella anterior"},
  "服务器身份已变化": {"en":"Server identity changed","es":"La identidad del servidor cambió"},
  "确认服务器身份": {"en":"Verify server identity","es":"Verificar identidad del servidor"},
  "信任并继续": {"en":"Trust and continue","es":"Confiar y continuar"},
  "连接服务器": {"en":"Connect to server","es":"Conectar al servidor"},
  "私钥口令": {"en":"Key passphrase","es":"Frase de la clave privada"},
  "登录密码": {"en":"Login password","es":"Contraseña de acceso"},
  "留空使用已保存的凭据": {"en":"Leave blank to use saved credentials","es":"Deja vacío para usar las credenciales guardadas"},
  "保存到系统凭据库": {"en":"Save in the system credential store","es":"Guardar en el almacén de credenciales del sistema"},
  "仅用于本机 SSH 认证，不发送给 AI。": {"en":"Used only for local SSH authentication; never sent to AI.","es":"Solo se usa para autenticar SSH en este equipo; no se envía a la IA."},
  "连接": {"en":"Connect","es":"Conectar"},
  "请先关闭当前弹窗": {"en":"Close the current dialog first","es":"Cierra primero el diálogo actual"},
  "例如：开发服务器": {"en":"For example: Development server","es":"Por ejemplo: Servidor de desarrollo"},
  "例如：项目调试": {"en":"For example: Project debugging","es":"Por ejemplo: Depuración del proyecto"},
  "起始目录": {"en":"Starting directory","es":"Directorio inicial"},
  "留空使用用户目录": {"en":"Leave blank for your home directory","es":"Deja vacío para usar tu carpeta personal"},
  "服务器地址": {"en":"Server address","es":"Dirección del servidor"},
  "端口": {"en":"Port","es":"Puerto"},
  "用户名": {"en":"Username","es":"Usuario"},
  "认证方式": {"en":"Authentication","es":"Autenticación"},
  "密码": {"en":"Password","es":"Contraseña"},
  "私钥": {"en":"Private key","es":"Clave privada"},
  "私钥文件": {"en":"Private key file","es":"Archivo de clave privada"},
  "默认远程目录": {"en":"Default remote directory","es":"Directorio remoto predeterminado"},
  "留空使用服务器默认目录": {"en":"Leave blank for the server default","es":"Deja vacío para usar el directorio del servidor"},
  "远程目录与 AI 命令首版按 Linux / POSIX Shell 处理。": {"en":"Remote paths and AI commands currently use Linux / POSIX shell conventions.","es":"Las rutas remotas y los comandos de IA usan convenciones de Linux / POSIX."},
  "分组": {"en":"Group","es":"Grupo"},
  "环境": {"en":"Environment","es":"Entorno"},
  "未标记": {"en":"Unmarked","es":"Sin marcar"},
  "关闭此 SSH 会话？远端任务可能仍在运行。": {"en":"Close this SSH session? Remote jobs may keep running.","es":"¿Cerrar esta sesión SSH? Las tareas remotas pueden seguir ejecutándose."},
  "关闭此终端及其中运行的本地程序？": {"en":"Close this terminal and its local programs?","es":"¿Cerrar este terminal y sus programas locales?"},
  "关闭会话": {"en":"Close session","es":"Cerrar sesión"},
  "删除连接配置及保存的凭据？已打开的会话可继续使用。": {"en":"Delete this connection and its saved credentials? Open sessions can continue.","es":"¿Eliminar la conexión y sus credenciales guardadas? Las sesiones abiertas pueden continuar."},
  "清除这条连接保存的密码或私钥口令？": {"en":"Forget this connection's saved password or key passphrase?","es":"¿Borrar la contraseña o frase de clave guardada para esta conexión?"},
  "已清除保存的凭据": {"en":"Saved credentials removed","es":"Credenciales guardadas eliminadas"},
  "远程已有同名文件，确认覆盖？": {"en":"A remote file with this name exists. Replace it?","es":"Ya existe un archivo remoto con ese nombre. ¿Reemplazarlo?"},
  "新建文件夹": {"en":"New folder","es":"Nueva carpeta"},
  "删除远程文件或空文件夹？": {"en":"Delete this remote file or empty folder?","es":"¿Eliminar este archivo remoto o carpeta vacía?"},
  "请先在终端中选中文字": {"en":"Select text in the terminal first","es":"Selecciona primero texto en el terminal"},
  "解释下面选中的终端输出：": {"en":"Explain the selected terminal output:","es":"Explica la salida seleccionada del terminal:"},
  "远程路径": {"en":"Remote path","es":"Ruta remota"},
  "打开目录": {"en":"Open directory","es":"Abrir directorio"},
  "项": {"en":"items","es":"elementos"},
  "文件夹": {"en":"Folder","es":"Carpeta"},
  "符号链接": {"en":"Symbolic link","es":"Enlace simbólico"},
  "下载": {"en":"Download","es":"Descargar"},
  "此目录没有可显示的文件": {"en":"No files to display in this directory","es":"No hay archivos que mostrar en este directorio"},
  "目录较大，仅显示前 2000 项": {"en":"Large directory: showing the first 2,000 items","es":"Directorio grande: se muestran los primeros 2000 elementos"},
  "传输完成": {"en":"Transfer complete","es":"Transferencia completada"},
  "执行 AI": {"en":"AI agent","es":"Agente de IA"},
  "跟随主 AI": {"en":"Use primary AI","es":"Usar IA principal"},
  "逐项确认后执行 · 独立通道 · 不读取键盘输入": {"en":"Approve each action · Separate channel · No keyboard input shared","es":"Confirma cada acción · Canal separado · Sin compartir pulsaciones"},
  "任意命令以目标账号权限运行，不属于系统沙箱。": {"en":"Commands use the target account's privileges, without a system sandbox.","es":"Los comandos usan los permisos de la cuenta de destino, sin aislamiento del sistema."},
  "让 AI 协助当前会话": {"en":"Ask AI to help with this session","es":"Pide ayuda a la IA con esta sesión"},
  "描述任务，AI 会先请求确认具体操作。终端历史不会自动发送。": {"en":"Describe a task. AI asks you to approve actions; terminal history is not sent automatically.","es":"Describe una tarea. La IA pide confirmar las acciones; el historial no se envía automáticamente."},
  "确认执行": {"en":"Approve execution","es":"Confirmar ejecución"},
  "描述任务，Ctrl+Enter 发送": {"en":"Describe a task; Ctrl+Enter to send","es":"Describe una tarea; Ctrl+Enter para enviar"},
  "操作结果会经过限量与脱敏": {"en":"Results are limited and sensitive values filtered","es":"Los resultados se limitan y los datos sensibles se filtran"},
  "终端外观": {"en":"Terminal appearance","es":"Aspecto del terminal"},
  "应用于当前及新建会话": {"en":"Applies to current and new sessions","es":"Se aplica a sesiones actuales y nuevas"},
  "终端主题": {"en":"Terminal theme","es":"Tema del terminal"},
  "深色": {"en":"Dark","es":"Oscuro"},
  "浅色": {"en":"Light","es":"Claro"},
  "终端字号": {"en":"Terminal font size","es":"Tamaño de letra del terminal"},
  "历史回滚行数": {"en":"Scrollback lines","es":"Líneas de historial"},
  "限制每个会话保留的输出，控制内存占用": {"en":"Limit retained output per session to control memory use","es":"Limita la salida conservada por sesión para controlar la memoria"},
  "SSH 密码与私钥口令保存在本机系统凭据库，可在连接菜单中清除。": {"en":"SSH passwords and key passphrases are saved in the local system credential store. Remove them from the connection menu.","es":"Las contraseñas SSH y frases de clave se guardan en el almacén local del sistema. Puedes borrarlas desde el menú de conexión."},
  "AI 每次读取文件或执行命令均需确认。任意命令拥有目标账号的权限；本机命令没有系统沙箱，远端停止也需要核对实际任务状态。": {"en":"Every AI file read or command needs approval. Commands use the target account's privileges. Local commands are not sandboxed; verify remote jobs after requesting a stop.","es":"Cada lectura o comando de IA requiere confirmación. Usa los permisos de la cuenta de destino. Los comandos locales no están aislados; verifica las tareas remotas tras solicitar su detención."},
  "展开或收起会话列表": {"en":"Toggle session list","es":"Mostrar u ocultar sesiones"},
  "重新连接": {"en":"Reconnect","es":"Reconectar"},
  "清空终端显示": {"en":"Clear terminal display","es":"Limpiar pantalla del terminal"},
  "关闭面板": {"en":"Close panel","es":"Cerrar panel"},
  "选择私钥文件": {"en":"Choose private key file","es":"Elegir archivo de clave privada"},
  "上传文件": {"en":"Upload files","es":"Subir archivos"},
  "上一级": {"en":"Parent directory","es":"Directorio superior"},
  "取消传输": {"en":"Cancel transfer","es":"Cancelar transferencia"},
  "解释选中内容": {"en":"Explain selected text","es":"Explicar texto seleccionado"},
  "未保存的会话": {"en":"Unsaved sessions","es":"Sesiones sin guardar"},
  "执行终端命令": {"en":"Execute terminal command","es":"Ejecutar comando del terminal"},
  "查看远程目录": {"en":"List remote directory","es":"Listar directorio remoto"},
  "读取远程文件": {"en":"Read remote file","es":"Leer archivo remoto"},
  "截图模式": {"en":"Capture mode","es":"Modo de captura"},
  "完整标注": {"en":"Full annotation","es":"Anotación completa"},
  "原生快速（试用）": {"en":"Native quick capture (trial)","es":"Captura nativa rápida (prueba)"},
  "框选后复制 · Enter 确认 · Esc 取消": {"en":"Select and copy · Enter to confirm · Esc to cancel","es":"Seleccionar y copiar · Enter para confirmar · Esc para cancelar"},
  "本次运行的截图按钮与快捷键使用此模式；原生原型支持框选、复制和取消。": {"en":"The screenshot button and shortcut use this mode for this run. The native prototype supports selection, copying and cancellation.","es":"El botón y el atajo usan este modo durante esta sesión. El prototipo nativo permite seleccionar, copiar y cancelar."},
  "拖动框选 · Enter / 双击复制 · Esc / 右键取消": {"en":"Drag to select · Enter / double-click to copy · Esc / right-click to cancel","es":"Arrastra para seleccionar · Enter / doble clic para copiar · Esc / clic derecho para cancelar"},
  "捕获时暂时隐藏小助手": {"en":"Temporarily hide the assistant during capture","es":"Ocultar temporalmente el asistente durante la captura"},
  "复制并完成 Enter": {"en":"Copy and finish Enter","es":"Copiar y finalizar Enter"},
  "图片已复制": {"en":"Image copied","es":"Imagen copiada"},
  "编辑提醒": {"en":"Edit reminder","es":"Editar recordatorio"},
  "提醒已更新": {"en":"Reminder updated","es":"Recordatorio actualizado"},
  "请先配置 API 密钥": {"en": "Configure an API key first", "es": "Configura primero una clave API"},
  "配置并选中模型后即可使用 AI 功能。": {"en": "Configure and select a model to use AI.", "es": "Configura y selecciona un modelo para usar la IA."},
  "前往配置密钥": {"en": "Configure API key", "es": "Configurar clave API"},
  "按住拖动排序，或按 Alt 加上下方向键": {"en": "Drag to reorder, or use Alt + Up/Down", "es": "Arrastra para ordenar o usa Alt + Arriba/Abajo"},
  "调整顺序": {"en": "Reorder", "es": "Cambiar orden"},
  "勾选显示，按住左侧手柄拖动排序；自动保存。": {"en": "Check to show. Drag the left handles to reorder. Changes save automatically.", "es": "Marca para mostrar. Arrastra las asas para ordenar. Se guarda automáticamente."},
  "保存排序失败：{0}": {"en": "Could not save order: {0}", "es": "No se pudo guardar el orden: {0}"},

  "所有提醒": {"en": "All reminders", "es": "Todos los recordatorios"},
  "新增提醒": {"en": "New reminder", "es": "Nuevo recordatorio"},
  "提醒方式": {"en": "Reminder type", "es": "Tipo de recordatorio"},
  "倒计时": {"en": "Countdown", "es": "Cuenta atrás"},
  "指定时间": {"en": "Date and time", "es": "Fecha y hora"},
  "到点后在屏幕顶部约 100px 处显示横条提醒；关闭后仅在列表中标记到点。": {"en": "Show a banner about 100px below the top of the screen when due. Otherwise, mark it in the list only.", "es": "Muestra una franja a unos 100 px del borde superior. Si se desactiva, solo se marca en la lista."},

  "定时器": {"en": "Timer", "es": "Temporizador"},
  "提醒": {"en": "Reminder", "es": "Recordatorio"},
  "提醒内容": {"en": "Message", "es": "Mensaje"},
  "例如：起身活动一下": {"en": "For example: take a stretch break", "es": "Por ejemplo: levántate y estírate"},
  "小时": {"en": "Hours", "es": "Horas"},
  "分钟": {"en": "Minutes", "es": "Minutos"},
  "秒": {"en": "Seconds", "es": "Segundos"},
  "提醒时间": {"en": "Reminder time", "es": "Hora del recordatorio"},
  "屏幕弹窗提醒": {"en": "On-screen alert", "es": "Aviso en pantalla"},
  "开始倒计时": {"en": "Start timer", "es": "Iniciar temporizador"},
  "添加提醒": {"en": "Add reminder", "es": "Añadir recordatorio"},
  "已到时间": {"en": "Time is up", "es": "Se acabó el tiempo"},
  "已处理": {"en": "Dismissed", "es": "Atendido"},
  "屏幕提醒已开启": {"en": "On-screen alert enabled", "es": "Aviso en pantalla activado"},
  "仅列表提醒": {"en": "List reminder only", "es": "Solo recordatorio en la lista"},
  "知道了": {"en": "Got it", "es": "Entendido"},
  "5 分钟后再提醒": {"en": "Remind me in 5 minutes", "es": "Recordar en 5 minutos"},
  "还没有定时器": {"en": "No timers yet", "es": "Aún no hay temporizadores"},
  "还没有提醒": {"en": "No reminders yet", "es": "Aún no hay recordatorios"},
  "倒计时结束": {"en": "Timer finished", "es": "Temporizador finalizado"},
  "提醒时间到了": {"en": "Reminder due", "es": "Es hora del recordatorio"},
  "定时器到时间了": {"en": "Your timer has finished", "es": "El temporizador ha finalizado"},
  "项待处理": {"en": "pending", "es": "pendientes"},
  "按 Esc 关闭当前提醒": {"en": "Press Esc to dismiss this alert", "es": "Pulsa Esc para cerrar este aviso"},
  "操作失败，请重试": {"en": "Action failed. Please try again", "es": "Error. Inténtalo de nuevo"},
  "倒计时已开始": {"en": "Timer started", "es": "Temporizador iniciado"},
  "提醒已添加": {"en": "Reminder added", "es": "Recordatorio añadido"},
  "设置倒计时，专注工作或稍作休息。": {"en": "Set a timer to focus or take a break.", "es": "Programa un temporizador para concentrarte o descansar."},
  "选择日期时间，到点提醒重要事项。": {"en": "Choose when to be reminded.", "es": "Elige cuándo recibir el recordatorio."},
  "开启后在屏幕正中间滑入提醒；关闭后仅在列表中标记到点。退出期间的提醒将在下次启动时补显示。": {"en": "When enabled, an alert slides into the center of the screen. Otherwise, due tasks are marked in the list. Missed alerts appear on the next launch.", "es": "Si se activa, el aviso se desliza al centro de la pantalla. Si no, se marca en la lista. Los avisos pendientes aparecen al volver a abrir la aplicación."},

  "保存模型「{0}」失败：{1}": { "en": "Could not save model “{0}”: {1}", "es": "No se pudo guardar el modelo «{0}»: {1}" },
  "未命名模型": { "en": "Unnamed model", "es": "Modelo sin nombre" },
  "配置名称：请输入 1～80 个字符": { "en": "Configuration name: enter 1–80 characters", "es": "Nombre de configuración: introduce entre 1 y 80 caracteres" },
  "模型 ID：请输入 1～200 个字符": { "en": "Model ID: enter 1–200 characters", "es": "ID del modelo: introduce entre 1 y 200 caracteres" },
  "默认翻译语言：请输入 1～30 个字符": { "en": "Default translation language: enter 1–30 characters", "es": "Idioma de traducción: introduce entre 1 y 30 caracteres" },
  "服务地址：请输入有效的模型服务地址": { "en": "Service URL: enter a valid model service URL", "es": "URL del servicio: introduce una URL válida" },
  "服务地址：云端服务需使用 HTTPS；本机服务可使用 HTTP": { "en": "Service URL: cloud services require HTTPS; local services may use HTTP", "es": "URL del servicio: los servicios en la nube requieren HTTPS; los locales pueden usar HTTP" },
  "服务地址：服务地址不能包含账号、查询参数或片段": { "en": "Service URL: remove credentials, query parameters and fragments", "es": "URL del servicio: elimina credenciales, parámetros y fragmentos" },
  "本机数据库：无法打开模型配置存储，请检查目录权限": { "en": "Local database: cannot open model storage. Check folder permissions.", "es": "Base de datos local: no se puede abrir el almacenamiento. Revisa los permisos de la carpeta." },
  "模型配置：无法编码保存数据": { "en": "Model configuration: could not encode data for saving", "es": "Configuración del modelo: no se pudieron codificar los datos para guardar" },
  "本机数据库：模型配置写入失败，请检查磁盘空间和目录权限": { "en": "Local database: could not save model configuration. Check disk space and folder permissions.", "es": "Base de datos local: no se pudo guardar el modelo. Revisa el espacio en disco y los permisos." },
  "已固定位置并置顶": {
    "en": "Position locked and window pinned",
    "es": "Posición bloqueada y ventana fijada"
  },
  "已解除固定": {
    "en": "Window unpinned",
    "es": "Ventana liberada"
  },
  "小助手": {
    "en": "Assistant",
    "es": "Asistente"
  },
  "收起为桌面小图标": {
    "en": "Collapse to desktop icon",
    "es": "Contraer a icono de escritorio"
  },
  "最小化": {
    "en": "Minimize",
    "es": "Minimizar"
  },
  "退出小助手": {
    "en": "Quit Assistant",
    "es": "Salir del asistente"
  },
  "解除固定与置顶": {
    "en": "Unlock and unpin",
    "es": "Desbloquear y liberar"
  },
  "固定位置并置顶": {
    "en": "Lock position and keep on top",
    "es": "Bloquear posición y mantener encima"
  },
  "写下要做的事…": {
    "en": "Write a task…",
    "es": "Escribe una tarea…"
  },
  "待办内容": {
    "en": "Task text",
    "es": "Texto de la tarea"
  },
  "添加中…": {
    "en": "Adding…",
    "es": "Añadiendo…"
  },
  "添加": {
    "en": "Add",
    "es": "Añadir"
  },
  "项待完成": {
    "en": "pending",
    "es": "pendientes"
  },
  "紧凑列表 ↗": {
    "en": "Compact list ↗",
    "es": "Lista compacta ↗"
  },
  "删除": {
    "en": "Delete",
    "es": "Eliminar"
  },
  "删除待办": {
    "en": "Delete task",
    "es": "Eliminar tarea"
  },
  "标记未完成": {
    "en": "Mark incomplete",
    "es": "Marcar como pendiente"
  },
  "标记完成": {
    "en": "Mark complete",
    "es": "Marcar como completada"
  },
  "还没有待办": {
    "en": "No tasks yet",
    "es": "Aún no hay tareas"
  },
  "在上方输入框写下第一件事": {
    "en": "Write your first task above",
    "es": "Escribe tu primera tarea arriba"
  },
  "随手记下想法、线索或临时信息…": {
    "en": "Jot down an idea or a quick note…",
    "es": "Anota una idea o una nota rápida…"
  },
  "速记内容": {
    "en": "Note text",
    "es": "Texto de la nota"
  },
  "条速记": {
    "en": "notes",
    "es": "notas"
  },
  "取消编辑": {
    "en": "Cancel editing",
    "es": "Cancelar edición"
  },
  "保存中…": {
    "en": "Saving…",
    "es": "Guardando…"
  },
  "保存修改": {
    "en": "Save changes",
    "es": "Guardar cambios"
  },
  "保存速记": {
    "en": "Save note",
    "es": "Guardar nota"
  },
  "编辑": {
    "en": "Edit",
    "es": "Editar"
  },
  "还没有速记": {
    "en": "No notes yet",
    "es": "Aún no hay notas"
  },
  "在上方输入，随时保存一条": {
    "en": "Write above and save anytime",
    "es": "Escribe arriba y guarda cuando quieras"
  },
  "文档子栏目": {
    "en": "Document sections",
    "es": "Secciones de documentos"
  },
  "待办": {
    "en": "Tasks",
    "es": "Tareas"
  },
  "速记": {
    "en": "Notes",
    "es": "Notas"
  },
  "电脑列表": {
    "en": "Computers",
    "es": "Equipos"
  },
  "添加电脑": {
    "en": "Add computer",
    "es": "Añadir equipo"
  },
  "本机": {
    "en": "This computer",
    "es": "Este equipo"
  },
  "待绑定": {
    "en": "Not linked",
    "es": "Sin vincular"
  },
  "取消": {
    "en": "Cancel",
    "es": "Cancelar"
  },
  "电脑名称": {
    "en": "Computer name",
    "es": "Nombre del equipo"
  },
  "例如：家用电脑": {
    "en": "e.g. Home computer",
    "es": "Ej.: Equipo de casa"
  },
  "电脑改名": {
    "en": "Rename computer",
    "es": "Renombrar equipo"
  },
  "添加电脑档案": {
    "en": "Add computer profile",
    "es": "Añadir perfil de equipo"
  },
  "电脑系统": {
    "en": "Operating system",
    "es": "Sistema operativo"
  },
  "保存名称": {
    "en": "Save name",
    "es": "Guardar nombre"
  },
  "重命名": {
    "en": "Rename",
    "es": "Renombrar"
  },
  "改名": {
    "en": "Rename",
    "es": "Renombrar"
  },
  "工作台子栏目": {
    "en": "Workspace sections",
    "es": "Secciones del espacio de trabajo"
  },
  "当前电脑": {
    "en": "Current computer",
    "es": "Equipo actual"
  },
  "待绑定到另一台电脑": {
    "en": "Waiting to link to another computer",
    "es": "Pendiente de vincular a otro equipo"
  },
  "删除电脑档案": {
    "en": "Delete computer profile",
    "es": "Eliminar perfil de equipo"
  },
  "项目": {
    "en": "Projects",
    "es": "Proyectos"
  },
  "应用": {
    "en": "Apps",
    "es": "Aplicaciones"
  },
  "这台电脑尚未绑定": {
    "en": "This computer is not linked yet",
    "es": "Este equipo aún no está vinculado"
  },
  "项目与应用的路径属于各自的电脑。以后开启同步后，可在“": {
    "en": "Paths belong to each computer. When sync is available, link this profile on “",
    "es": "Las rutas pertenecen a cada equipo. Cuando haya sincronización, vincula este perfil en «"
  },
  "”上绑定此档案并添加入口。": {
    "en": "” and add shortcuts.",
    "es": "» y añade accesos directos."
  },
  "还没有电脑档案": {
    "en": "No computer profiles yet",
    "es": "Aún no hay perfiles de equipo"
  },
  "搜索": {
    "en": "Search ",
    "es": "Buscar "
  },
  "打开 ↗": {
    "en": "Open ↗",
    "es": "Abrir ↗"
  },
  "更多操作": {
    "en": "More actions",
    "es": "Más acciones"
  },
  "的更多操作": {
    "en": " — more actions",
    "es": " — más acciones"
  },
  "没有找到匹配项": {
    "en": "No matches found",
    "es": "No se encontraron resultados"
  },
  "还没有{0}": {
    "en": "No {0} yet",
    "es": "Aún no hay {0}"
  },
  "试试上方的添加按钮": {
    "en": "Try the Add button above",
    "es": "Prueba el botón Añadir de arriba"
  },
  "点击上方“添加{0}”": {
    "en": "Click Add {0} above",
    "es": "Haz clic en Añadir {0} arriba"
  },
  "名称": {
    "en": "Name",
    "es": "Nombre"
  },
  "输入显示名称": {
    "en": "Enter a display name",
    "es": "Introduce un nombre"
  },
  "浏览": {
    "en": "Browse",
    "es": "Examinar"
  },
  "保存": {
    "en": "Save",
    "es": "Guardar"
  },
  "项目文件夹": {
    "en": "Project folder",
    "es": "Carpeta del proyecto"
  },
  "应用入口": {
    "en": "App shortcut",
    "es": "Acceso a la aplicación"
  },
  "选择项目文件夹": {
    "en": "Select a project folder",
    "es": "Selecciona la carpeta del proyecto"
  },
  "选择程序文件或应用": {
    "en": "Select a program or app",
    "es": "Selecciona un programa o aplicación"
  },
  "编辑器": {
    "en": "Editor",
    "es": "Editor"
  },
  "选择编辑器程序": {
    "en": "Select an editor program",
    "es": "Selecciona un editor"
  },
  "移除入口": {
    "en": "Remove shortcut",
    "es": "Quitar acceso"
  },
  "功能显示": {
    "en": "Visible features",
    "es": "Funciones visibles"
  },
  "勾选需要显示的功能，自动保存；隐藏不删除数据。": {
    "en": "Choose which features to show. Saved automatically; hiding keeps your data.",
    "es": "Elige las funciones visibles. Se guarda automáticamente; ocultar no elimina datos."
  },
  "设置始终显示，可随时恢复隐藏的功能。": {
    "en": "Settings is always visible, so you can restore hidden features anytime.",
    "es": "Ajustes siempre está visible para restaurar funciones ocultas."
  },
  "开机启动": {
    "en": "Launch at login",
    "es": "Iniciar al entrar"
  },
  "登录系统后自动打开小助手": {
    "en": "Open Assistant when you sign in",
    "es": "Abrir el asistente al iniciar sesión"
  },
  "固定并置顶": {
    "en": "Always on top",
    "es": "Siempre encima"
  },
  "锁定位置，显示在普通窗口上方": {
    "en": "Lock position and stay above other windows",
    "es": "Bloquear posición y mantener sobre otras ventanas"
  },
  "数据保存在本机。最小化后可点击任务栏图标恢复，也可通过系统托盘显示或退出应用。": {
    "en": "Data stays on this computer. Restore the window from the taskbar, or use the system tray to show or quit the app.",
    "es": "Los datos se guardan en este equipo. Restaura la ventana desde la barra de tareas o usa la bandeja del sistema para mostrar o salir."
  },
  "文档": {
    "en": "Documents",
    "es": "Documentos"
  },
  "工作台": {
    "en": "Workspace",
    "es": "Espacio"
  },
  "工具": {
    "en": "Tools",
    "es": "Herramientas"
  },
  "设置": {
    "en": "Settings",
    "es": "Ajustes"
  },
  "正在录屏": {
    "en": "Recording",
    "es": "Grabando"
  },
  "点击展开，拖动可移动小图标": {
    "en": "Click to expand; drag to move",
    "es": "Haz clic para abrir; arrastra para mover"
  },
  "展开": {
    "en": "Expand",
    "es": "Abrir"
  },
  "固定": {
    "en": "Pin",
    "es": "Fijar"
  },
  "新增待办": {
    "en": "New task",
    "es": "Nueva tarea"
  },
  "新增": {
    "en": "New",
    "es": "Nueva"
  },
  "解除固定": {
    "en": "Unpin",
    "es": "Liberar"
  },
  "紧凑列表": {
    "en": "Compact list",
    "es": "Lista compacta"
  },
  "紧凑": {
    "en": "Compact",
    "es": "Compacta"
  },
  "展开主界面": {
    "en": "Open main window",
    "es": "Abrir ventana principal"
  },
  "＋ 新增": {
    "en": "＋ New",
    "es": "＋ Nueva"
  },
  "删除待办：": {
    "en": "Delete task: ",
    "es": "Eliminar tarea: "
  },
  "还没有待办，点击下方新增": {
    "en": "No tasks yet. Add one below.",
    "es": "Aún no hay tareas. Añade una abajo."
  },
  "关闭": {
    "en": "Close",
    "es": "Cerrar"
  },
  "关闭新增待办": {
    "en": "Close new task",
    "es": "Cerrar nueva tarea"
  },
  "{0}的操作": {
    "en": "Actions for {0}",
    "es": "Acciones de {0}"
  },
  "当前项目或应用尚未保存，确定离开吗？": {
    "en": "This project or app has unsaved changes. Leave anyway?",
    "es": "Este proyecto o aplicación tiene cambios sin guardar. ¿Salir?"
  },
  "电脑档案尚未保存，确定离开吗？": {
    "en": "This computer profile has unsaved changes. Leave anyway?",
    "es": "Este perfil tiene cambios sin guardar. ¿Salir?"
  },
  "当前入口尚未保存，确定切换吗？": {
    "en": "This shortcut has unsaved changes. Switch anyway?",
    "es": "Este acceso tiene cambios sin guardar. ¿Cambiar?"
  },
  "电脑档案尚未保存，确定切换吗？": {
    "en": "This computer profile has unsaved changes. Switch anyway?",
    "es": "Este perfil tiene cambios sin guardar. ¿Cambiar?"
  },
  "当前入口尚未保存，确定添加电脑吗？": {
    "en": "This shortcut has unsaved changes. Add a computer anyway?",
    "es": "Este acceso tiene cambios sin guardar. ¿Añadir un equipo?"
  },
  "删除电脑档案“{0}”及其项目、应用入口？": {
    "en": "Delete computer profile “{0}” and its project and app shortcuts?",
    "es": "¿Eliminar el perfil «{0}» y sus accesos a proyectos y aplicaciones?"
  },
  "电脑档案已删除": {
    "en": "Computer profile deleted",
    "es": "Perfil de equipo eliminado"
  },
  "当前输入的速记尚未保存，确定改为编辑这条吗？": {
    "en": "Your current note is not saved. Edit this note instead?",
    "es": "Tu nota actual no está guardada. ¿Editar esta nota?"
  },
  "删除这条速记？": {
    "en": "Delete this note?",
    "es": "¿Eliminar esta nota?"
  },
  "速记已删除": {
    "en": "Note deleted",
    "es": "Nota eliminada"
  },
  "删除待办“{0}”？": {
    "en": "Delete task “{0}”?",
    "es": "¿Eliminar la tarea «{0}»?"
  },
  "待办已删除": {
    "en": "Task deleted",
    "es": "Tarea eliminada"
  },
  "选择程序或应用": {
    "en": "Select a program or application",
    "es": "Selecciona un programa o aplicación"
  },
  "从小助手移除“{0}”？磁盘文件不会删除。": {
    "en": "Remove “{0}” from Assistant? Files on disk will remain.",
    "es": "¿Quitar «{0}» del asistente? Los archivos del disco se conservarán."
  },
  "入口已移除": {
    "en": "Shortcut removed",
    "es": "Acceso eliminado"
  },
  "已发送打开请求": {
    "en": "Open request sent",
    "es": "Solicitud de apertura enviada"
  },
  "请输入待办内容": {
    "en": "Enter a task",
    "es": "Introduce una tarea"
  },
  "已加入待办列表": {
    "en": "Added to tasks",
    "es": "Añadido a tareas"
  },
  "请输入速记内容": {
    "en": "Enter a note",
    "es": "Introduce una nota"
  },
  "速记已保存": {
    "en": "Note saved",
    "es": "Nota guardada"
  },
  "已保存": {
    "en": "Saved",
    "es": "Guardado"
  },
  "请输入电脑名称": {
    "en": "Enter a computer name",
    "es": "Introduce un nombre de equipo"
  },
  "电脑名称已更新": {
    "en": "Computer renamed",
    "es": "Equipo renombrado"
  },
  "电脑档案已添加": {
    "en": "Computer profile added",
    "es": "Perfil de equipo añadido"
  },
  "保存功能显示失败：{0}": {
    "en": "Could not save feature visibility: {0}",
    "es": "No se pudo guardar la visibilidad: {0}"
  },
  "已开启开机启动": {
    "en": "Launch at login enabled",
    "es": "Inicio automático activado"
  },
  "已关闭开机启动": {
    "en": "Launch at login disabled",
    "es": "Inicio automático desactivado"
  },
  "保存窗口位置失败": {
    "en": "Could not save window position",
    "es": "No se pudo guardar la posición"
  },
  "当前桌面环境不支持置顶": {
    "en": "This desktop environment does not support always on top",
    "es": "Este escritorio no permite mantener ventanas encima"
  },
  "初始化失败：{0}": {
    "en": "Initialization failed: {0}",
    "es": "Error al iniciar: {0}"
  },
  "恢复窗口失败：{0}": {
    "en": "Could not restore window: {0}",
    "es": "No se pudo restaurar la ventana: {0}"
  },
  "读取捕获设置失败：{0}": {
    "en": "Could not load capture settings: {0}",
    "es": "No se pudieron cargar los ajustes de captura: {0}"
  },
  "部分捕获快捷键未生效，请到设置中查看具体原因": {
    "en": "Some capture shortcuts are unavailable. See Settings for details.",
    "es": "Algunos atajos no están disponibles. Consulta los detalles en Ajustes."
  },
  "初始化快捷键失败：{0}": {
    "en": "Could not initialize shortcuts: {0}",
    "es": "No se pudieron inicializar los atajos: {0}"
  },
  "请先在设置中显示此功能": {
    "en": "Enable this feature in Settings first",
    "es": "Activa esta función en Ajustes"
  },
  "截图与录屏快捷键": {
    "en": "Capture shortcuts",
    "es": "Atajos de captura"
  },
  "应用运行时全局生效。录屏快捷键再次按下可停止录制。点击输入框并按组合键，再保存；Esc 撤销修改。": {
    "en": "Global while the app is running. Press the recording shortcut again to stop. Click a field, press a key combination, then save. Esc cancels edits.",
    "es": "Funcionan mientras la app está abierta. Pulsa de nuevo el atajo de grabación para detenerla. Haz clic en un campo, pulsa una combinación y guarda. Esc cancela."
  },
  "组合键需包含 Ctrl、Alt 或 Win/⌘，可再加 Shift。支持字母、数字、F1–F24、方向键等。": {
    "en": "Use Ctrl, Alt or Win/⌘, optionally with Shift. Letters, numbers, F1–F24 and arrows are supported.",
    "es": "Usa Ctrl, Alt o Win/⌘, con Shift opcional. Admite letras, números, F1–F24 y flechas."
  },
  "快捷键": {
    "en": " shortcut",
    "es": ": atajo"
  },
  "未启用，点击后按组合键": {
    "en": "Disabled; click and press a shortcut",
    "es": "Desactivado; haz clic y pulsa un atajo"
  },
  "保存快捷键": {
    "en": "Save shortcut",
    "es": "Guardar atajo"
  },
  "停用快捷键": {
    "en": "Disable shortcut",
    "es": "Desactivar atajo"
  },
  "停用": {
    "en": "Disable ",
    "es": "Desactivar "
  },
  "常用工具": {
    "en": "Common tools",
    "es": "Herramientas"
  },
  "停止并保存": {
    "en": "Stop and save",
    "es": "Detener y guardar"
  },
  "返回工具列表": {
    "en": "Back to tools",
    "es": "Volver a herramientas"
  },
  "‹ 工具": {
    "en": "‹ Tools",
    "es": "‹ Herramientas"
  },
  "截图与录屏": {
    "en": "Screenshots and recordings",
    "es": "Capturas y grabaciones"
  },
  "完成后再选择保存位置；取消保存会保留在待保存列表。": {
    "en": "Choose a save location after capture. Canceling keeps the result in Pending saves.",
    "es": "Elige dónde guardar al terminar. Si cancelas, el resultado queda en Pendientes."
  },
  "录屏倒计时": {
    "en": "Recording countdown",
    "es": "Cuenta atrás"
  },
  "录屏帧率": {
    "en": "Recording frame rate",
    "es": "Fotogramas por segundo"
  },
  "录屏显示鼠标指针（Windows）": {
    "en": "Show mouse pointer in recordings (Windows)",
    "es": "Mostrar cursor al grabar (Windows)"
  },
  "默认保存目录": {
    "en": " save folder",
    "es": ": carpeta de guardado"
  },
  "每次选择保存位置": {
    "en": "Choose a location each time",
    "es": "Elegir ubicación cada vez"
  },
  "选择保存目录": {
    "en": "Choose save folder",
    "es": "Elegir carpeta"
  },
  "恢复系统默认目录": {
    "en": "Reset to system default folder",
    "es": "Restablecer carpeta predeterminada"
  },
  "截图": {
    "en": "Screenshot",
    "es": "Captura"
  },
  "录屏": {
    "en": "Recording",
    "es": "Grabación"
  },
  "{0} 秒": {
    "en": "{0} seconds",
    "es": "{0} segundos"
  },
  "待保存 ·": {
    "en": "Pending saves ·",
    "es": "Pendientes ·"
  },
  "先预览，再另存。未保存的结果下次打开仍可找回。": {
    "en": "Preview, then save a copy. Pending results remain available after restarting.",
    "es": "Previsualiza y guarda una copia. Los resultados pendientes se conservan al reiniciar."
  },
  "待保存截图": {
    "en": "Pending screenshot",
    "es": "Captura pendiente"
  },
  "录屏预览": {
    "en": "Recording preview",
    "es": "Vista previa de grabación"
  },
  "另存": {
    "en": "Save as",
    "es": "Guardar como"
  },
  "删除草稿": {
    "en": "Delete draft",
    "es": "Eliminar borrador"
  },
  "收起详情": {
    "en": "Hide details",
    "es": "Ocultar detalles"
  },
  "查看详情": {
    "en": "View details",
    "es": "Ver detalles"
  },
  "输入算式": {
    "en": "Enter an expression",
    "es": "Introduce una operación"
  },
  "计算算式": {
    "en": "Math expression",
    "es": "Operación matemática"
  },
  "支持括号、百分比；按 Enter 计算，Esc 清空。": {
    "en": "Supports parentheses and percentages. Enter calculates; Esc clears.",
    "es": "Admite paréntesis y porcentajes. Enter calcula; Esc borra."
  },
  "退格": {
    "en": "Backspace",
    "es": "Retroceso"
  },
  "清空": {
    "en": "Clear",
    "es": "Borrar"
  },
  "切换正负": {
    "en": "Change sign",
    "es": "Cambiar signo"
  },
  "计算历史": {
    "en": "Calculation history",
    "es": "Historial de cálculos"
  },
  "捕获时暂时最小化小助手": {
    "en": "Minimize Assistant during capture",
    "es": "Minimizar el asistente durante la captura"
  },
  "桌面框选 → 标注 → 完成后保存": {
    "en": "Select area → Annotate → Save",
    "es": "Seleccionar área → Anotar → Guardar"
  },
  "选择区域 → 倒计时 → 录制 → 完成后保存": {
    "en": "Select area → Countdown → Record → Save",
    "es": "Seleccionar área → Cuenta atrás → Grabar → Guardar"
  },
  "显示器": {
    "en": "Display",
    "es": "Pantalla"
  },
  "正在读取屏幕信息…": {
    "en": "Loading displays…",
    "es": "Cargando pantallas…"
  },
  "当前平台通过系统选择屏幕或窗口。区域录屏和桌面悬浮控制条暂限 Windows。": {
    "en": "Use the system picker to select a screen or window. Region recording and floating controls currently require Windows.",
    "es": "Usa el selector del sistema para elegir una pantalla o ventana. La grabación por área y los controles flotantes requieren Windows."
  },
  "结束录制并预览": {
    "en": "Stop recording and preview",
    "es": "Detener y previsualizar"
  },
  "已暂停": {
    "en": "Paused",
    "es": "En pausa"
  },
  "继续录制": {
    "en": "Resume recording",
    "es": "Reanudar grabación"
  },
  "暂停录制": {
    "en": "Pause recording",
    "es": "Pausar grabación"
  },
  "正在捕获…": {
    "en": "Capturing…",
    "es": "Capturando…"
  },
  "开始截图": {
    "en": "Take screenshot",
    "es": "Tomar captura"
  },
  "选择录制区域": {
    "en": "Select recording area",
    "es": "Seleccionar área de grabación"
  },
  "支持选区调整、画笔、箭头、形状、文字、马赛克、序号、撤销与复制。": {
    "en": "Adjust selection, draw, add arrows, shapes, text, mosaic or numbers; undo and copy.",
    "es": "Ajusta el área, dibuja, añade flechas, formas, texto, mosaico o números; deshaz y copia."
  },
  "{0} 秒倒计时 · {1} FPS · 无声录制。可通过悬浮控制条或托盘结束。": {
    "en": "{0}s countdown · {1} FPS · No audio. Stop via the floating controls or system tray.",
    "es": "Cuenta atrás de {0}s · {1} FPS · Sin audio. Detén desde los controles flotantes o la bandeja."
  },
  "最近截图预览": {
    "en": "Latest screenshot preview",
    "es": "Vista previa de la última captura"
  },
  "打开文件夹": {
    "en": "Open folder",
    "es": "Abrir carpeta"
  },
  "快捷键已保存并生效": {
    "en": "Shortcut saved and active",
    "es": "Atajo guardado y activo"
  },
  "快捷键已停用": {
    "en": "Shortcut disabled",
    "es": "Atajo desactivado"
  },
  "选择默认保存目录": {
    "en": "Choose default save folder",
    "es": "Elegir carpeta predeterminada"
  },
  "删除这份未保存的截图或录屏？此操作无法撤销。": {
    "en": "Delete this unsaved capture or recording? This cannot be undone.",
    "es": "¿Eliminar esta captura o grabación sin guardar? No se puede deshacer."
  },
  "请按 Ctrl、Alt 或 Win/⌘ 加字母、数字等组合键": {
    "en": "Press Ctrl, Alt or Win/⌘ with a letter, number or other key",
    "es": "Pulsa Ctrl, Alt o Win/⌘ junto con una letra, número u otra tecla"
  },
  "保存{0}": {
    "en": "Save {0}",
    "es": "Guardar {0}"
  },
  "已保留在待保存列表": {
    "en": "Kept in Pending saves",
    "es": "Conservado en Pendientes"
  },
  "截图已固定到桌面，可拖动、另存或关闭": {
    "en": "Screenshot pinned to desktop. Drag, save or close it.",
    "es": "Captura fijada al escritorio. Puedes arrastrarla, guardarla o cerrarla."
  },
  "没有读取到屏幕画面": {
    "en": "No screen image received",
    "es": "No se recibió ninguna imagen de pantalla"
  },
  "截图生成失败": {
    "en": "Screenshot generation failed",
    "es": "No se pudo generar la captura"
  },
  "当前系统 WebView 不支持屏幕捕获，请更新系统及 WebView 后重试": {
    "en": "This WebView does not support screen capture. Update your system and WebView.",
    "es": "Este WebView no admite capturas. Actualiza el sistema y WebView."
  },
  "屏幕选择已取消或权限未允许；请允许屏幕录制后重试。": {
    "en": "Screen selection canceled or permission denied. Allow screen recording and try again.",
    "es": "Selección cancelada o permiso denegado. Permite la grabación e inténtalo de nuevo."
  },
  "当前系统 WebView 不支持视频编码": {
    "en": "This WebView does not support video encoding",
    "es": "Este WebView no admite codificación de vídeo"
  },
  "当前系统没有可用的视频编码器": {
    "en": "No video encoder available",
    "es": "No hay codificador de vídeo disponible"
  },
  "{0} 秒后开始录制": {
    "en": "Recording starts in {0} seconds",
    "es": "La grabación comienza en {0} segundos"
  },
  "磁盘写入速度过慢，录制已停止": {
    "en": "Disk writes are too slow. Recording stopped.",
    "es": "El disco escribe demasiado lento. Se detuvo la grabación."
  },
  "录屏编码失败": {
    "en": "Video encoding failed",
    "es": "Error de codificación de vídeo"
  },
  "录制完成，可预览后另存": {
    "en": "Recording finished. Preview and save a copy.",
    "es": "Grabación terminada. Previsualiza y guarda una copia."
  },
  "请等待录屏保存完成后再退出": {
    "en": "Wait for the recording to finish saving before quitting",
    "es": "Espera a que se guarde la grabación antes de salir"
  },
  "录屏保存失败：{0}": {
    "en": "Could not save recording: {0}",
    "es": "No se pudo guardar la grabación: {0}"
  },
  "请先完成当前保存操作": {
    "en": "Finish the current save operation first",
    "es": "Termina primero el guardado actual"
  },
  "请等待生成或配置操作结束后再修改模型": {
    "en": "Wait for generation or configuration to finish before changing models",
    "es": "Espera a que termine la generación o configuración antes de cambiar de modelo"
  },
  "上次生成已中断，可重试": {
    "en": "Previous generation was interrupted. You can retry.",
    "es": "La generación anterior se interrumpió. Puedes reintentar."
  },
  "读取 AI 数据失败：{0}": {
    "en": "Could not load AI data: {0}",
    "es": "No se pudieron cargar los datos de IA: {0}"
  },
  "移除引用": {
    "en": "Remove reference",
    "es": "Quitar referencia"
  },
  "当前模型": {
    "en": "Model",
    "es": "Modelo"
  },
  "请先在设置中添加模型": {
    "en": "Add a model in Settings first",
    "es": "Añade un modelo en Ajustes"
  },
  "正在读取 AI 数据…": {
    "en": "Loading AI data…",
    "es": "Cargando datos de IA…"
  },
  "输入问题…": {
    "en": "Ask a question…",
    "es": "Escribe una pregunta…"
  },
  "AI 消息": {
    "en": "AI message",
    "es": "Mensaje de IA"
  },
  "发送至已配置服务 ·": {
    "en": "Sent to configured service ·",
    "es": "Enviado al servicio configurado ·"
  },
  "· 不自动读取其他资料": {
    "en": "· No automatic access to other data",
    "es": "· Sin acceso automático a otros datos"
  },
  "AI 助手": {
    "en": "AI Assistant",
    "es": "Asistente de IA"
  },
  "历史": {
    "en": "History",
    "es": "Historial"
  },
  "还没有会话": {
    "en": "No conversations yet",
    "es": "Aún no hay conversaciones"
  },
  "你": {
    "en": "You",
    "es": "Tú"
  },
  "正在思考…": {
    "en": "Thinking…",
    "es": "Pensando…"
  },
  "复制": {
    "en": "Copy",
    "es": "Copiar"
  },
  "另存速记": {
    "en": "Save as note",
    "es": "Guardar como nota"
  },
  "提取待办": {
    "en": "Extract tasks",
    "es": "Extraer tareas"
  },
  "今天需要什么帮助？": {
    "en": "How can I help today?",
    "es": "¿En qué puedo ayudarte hoy?"
  },
  "整理速记、解释截图，或者直接聊聊。": {
    "en": "Organize notes, explain screenshots, or just chat.",
    "es": "Organiza notas, explica capturas o conversa."
  },
  "在下方引用速记或添加图片，只有选中的内容会随会话发送。": {
    "en": "Reference notes or add images below. Only selected content is sent with the conversation.",
    "es": "Añade notas o imágenes abajo. Solo se envía el contenido seleccionado con la conversación."
  },
  "重试上次请求": {
    "en": "Retry last request",
    "es": "Reintentar solicitud"
  },
  "选择要引用的速记": {
    "en": "Choose a note to reference",
    "es": "Elige una nota como referencia"
  },
  "引用速记": {
    "en": "Reference note",
    "es": "Añadir nota"
  },
  "添加图片": {
    "en": "Add image",
    "es": "Añadir imagen"
  },
  "停止生成": {
    "en": "Stop generation",
    "es": "Detener generación"
  },
  "发送": {
    "en": "Send",
    "es": "Enviar"
  },
  "请先在设置中配置 AI": {
    "en": "Configure AI in Settings first",
    "es": "Configura la IA en Ajustes"
  },
  "AI 模型": {
    "en": "AI models",
    "es": "Modelos de IA"
  },
  "可保存多个模型，点击「使用」选中一个。聊天、速记和截图使用当前选中的模型。": {
    "en": "Save multiple models and click Use to select one. Chat, notes and screenshots use the selected model.",
    "es": "Guarda varios modelos y pulsa Usar para elegir uno. El chat, las notas y las capturas usan el modelo seleccionado."
  },
  "服务预设": {
    "en": "Service preset",
    "es": "Servicio predefinido"
  },
  "配置名称": {
    "en": "Configuration name",
    "es": "Nombre de configuración"
  },
  "例如：日常问答、截图识别": {
    "en": "e.g. Daily chat, image analysis",
    "es": "Ej.: Chat diario, análisis de imágenes"
  },
  "服务地址": {
    "en": "Service URL",
    "es": "URL del servicio"
  },
  "https://服务地址/v1": {
    "en": "https://service-url/v1",
    "es": "https://url-del-servicio/v1"
  },
  "模型 ID": {
    "en": "Model ID",
    "es": "ID del modelo"
  },
  "填写服务提供的模型 ID，可自定义": {
    "en": "Enter the model ID; custom values supported",
    "es": "Introduce el ID del modelo; admite valores personalizados"
  },
  "API 密钥": {
    "en": "API key",
    "es": "Clave API"
  },
  "所选模型支持图片": {
    "en": "This model supports images",
    "es": "Este modelo admite imágenes"
  },
  "默认翻译语言": {
    "en": "Default translation language",
    "es": "Idioma predeterminado de traducción"
  },
  "保存配置": {
    "en": "Save configuration",
    "es": "Guardar configuración"
  },
  "预设可修改；可用模型与图片能力以服务账号为准。更换地址后请重新填写密钥。新增模型需分别设置密钥。": {
    "en": "Presets are editable. Available models and image support depend on your account. Re-enter the key after changing URLs. Each new configuration needs its own key.",
    "es": "Puedes editar los ajustes. Los modelos y las imágenes dependen de tu cuenta. Introduce la clave de nuevo al cambiar la URL. Cada configuración necesita su propia clave."
  },
  "密钥保存在系统凭据库。聊天及附件保存在本机；切换服务后发送消息，会将当前会话上下文和引用资料发送给所选服务。连接测试只发送一条测试消息。": {
    "en": "Keys are stored in the system credential vault. Chats and attachments stay locally. Sending after switching services shares the current conversation and references with the selected service. Connection tests send only a test message.",
    "es": "Las claves se guardan en el almacén de credenciales. Chats y adjuntos se guardan localmente. Al enviar tras cambiar de servicio, se comparte la conversación y sus referencias con el servicio elegido. Las pruebas solo envían un mensaje de prueba."
  },
  "＋ 添加模型": {
    "en": "＋ Add model",
    "es": "＋ Añadir modelo"
  },
  "当前": {
    "en": "Active",
    "es": "Activo"
  },
  " · 支持图片": {
    "en": " · Images supported",
    "es": " · Admite imágenes"
  },
  "使用": {
    "en": "Use",
    "es": "Usar"
  },
  "还没有模型，选择下方预设或填写自定义服务后保存。": {
    "en": "No models yet. Choose a preset below or enter a custom service, then save.",
    "es": "Aún no hay modelos. Elige un servicio predefinido o introduce uno personalizado y guarda."
  },
  "编辑模型": {
    "en": "Edit model",
    "es": "Editar modelo"
  },
  "添加模型": {
    "en": "Add model",
    "es": "Añadir modelo"
  },
  "常用模型": {
    "en": "Suggested models",
    "es": "Modelos sugeridos"
  },
  "选择预设或在下方自定义": {
    "en": "Choose a preset or enter a custom ID below",
    "es": "Elige un modelo o introduce un ID personalizado abajo"
  },
  "已保存在系统凭据库；留空保留": {
    "en": "Stored in credential vault; leave blank to keep",
    "es": "Guardada en el almacén; deja vacío para conservar"
  },
  "填写此配置的密钥；本地免密服务可留空": {
    "en": "Enter a key; local services may not need one",
    "es": "Introduce una clave; los servicios locales pueden no necesitarla"
  },
  "保存并测试": {
    "en": "Save and test",
    "es": "Guardar y probar"
  },
  "移除已保存密钥": {
    "en": "Remove saved key",
    "es": "Eliminar clave guardada"
  },
  "清空聊天记录和附件": {
    "en": "Clear chats and attachments",
    "es": "Borrar chats y adjuntos"
  },
  "整理内容": {
    "en": "Organize",
    "es": "Organizar"
  },
  "提炼摘要": {
    "en": "Summarize",
    "es": "Resumir"
  },
  "继续聊": {
    "en": "Continue chat",
    "es": "Continuar chat"
  },
  "解释截图": {
    "en": "Explain screenshot",
    "es": "Explicar captura"
  },
  "翻译文字": {
    "en": "Translate text",
    "es": "Traducir texto"
  },
  "提取文字": {
    "en": "Extract text",
    "es": "Extraer texto"
  },
  "请在设置中配置并启用支持图片的 AI 模型。": {
    "en": "Configure an image-capable model and enable images in Settings.",
    "es": "Configura un modelo compatible con imágenes y activa las imágenes en Ajustes."
  },
  "AI 结果": {
    "en": "AI result",
    "es": "Resultado de IA"
  },
  "重试": {
    "en": "Retry",
    "es": "Reintentar"
  },
  "替换原文": {
    "en": "Replace original",
    "es": "Reemplazar original"
  },
  "撤销替换": {
    "en": "Undo replacement",
    "es": "Deshacer reemplazo"
  },
  "待办候选": {
    "en": "Suggested tasks",
    "es": "Tareas sugeridas"
  },
  "已添加": {
    "en": "Added",
    "es": "Añadido"
  },
  "没有提取到明确待办。": {
    "en": "No actionable tasks found.",
    "es": "No se encontraron tareas concretas."
  },
  "添加勾选项": {
    "en": "Add selected",
    "es": "Añadir seleccionadas"
  },
  "地址已变更，请填写此服务的密钥": {
    "en": "URL changed; enter the key for this service",
    "es": "URL modificada; introduce la clave de este servicio"
  },
  "AI 数据正在加载或清理，请稍候": {
    "en": "AI data is loading or being cleared. Please wait.",
    "es": "Los datos de IA se están cargando o borrando. Espera."
  },
  "请输入问题或添加资料": {
    "en": "Enter a question or add a reference",
    "es": "Escribe una pregunta o añade una referencia"
  },
  "请等待生成结束或停止后再修改模型配置": {
    "en": "Wait for generation to finish or stop it before editing models",
    "es": "Espera a que termine la generación o detenla antes de editar modelos"
  },
  "AI 配置已保存": {
    "en": "AI configuration saved",
    "es": "Configuración de IA guardada"
  },
  "正在保存或测试 AI 配置，请稍候": {
    "en": "Saving or testing AI configuration. Please wait.",
    "es": "Guardando o probando la configuración. Espera."
  },
  "请先在设置中配置 AI 服务": {
    "en": "Configure an AI service in Settings first",
    "es": "Configura un servicio de IA en Ajustes"
  },
  "图片对话": {
    "en": "Image conversation",
    "es": "Conversación con imágenes"
  },
  "已停止生成": {
    "en": "Generation stopped",
    "es": "Generación detenida"
  },
  "保存会话失败：{0}": {
    "en": "Could not save conversation: {0}",
    "es": "No se pudo guardar la conversación: {0}"
  },
  "AI 数据尚未加载完成": {
    "en": "AI data has not finished loading",
    "es": "Los datos de IA aún se están cargando"
  },
  "正在清理聊天记录，请稍候": {
    "en": "Clearing chat history. Please wait.",
    "es": "Borrando historial. Espera."
  },
  "删除模型配置「{0}」及其当前地址的密钥？聊天记录会保留。": {
    "en": "Delete model configuration “{0}” and its key for the current URL? Chats will remain.",
    "es": "¿Eliminar la configuración «{0}» y la clave de su URL actual? Los chats se conservarán."
  },
  "删除模型配置": {
    "en": "Delete model configuration",
    "es": "Eliminar configuración del modelo"
  },
  "请等待当前操作完成": {
    "en": "Wait for the current operation to finish",
    "es": "Espera a que termine la operación actual"
  },
  "删除此会话及其附件？": {
    "en": "Delete this conversation and its attachments?",
    "es": "¿Eliminar esta conversación y sus adjuntos?"
  },
  "删除 AI 会话": {
    "en": "Delete AI conversation",
    "es": "Eliminar conversación de IA"
  },
  "清空全部 AI 聊天记录与附件？已保存的速记和待办会保留。": {
    "en": "Clear all AI chats and attachments? Saved notes and tasks will remain.",
    "es": "¿Borrar todos los chats de IA y sus adjuntos? Las notas y tareas guardadas se conservarán."
  },
  "清空 AI 历史": {
    "en": "Clear AI history",
    "es": "Borrar historial de IA"
  },
  "连接测试成功（图片能力需用实际截图验证）": {
    "en": "Connection test passed. Verify image support with an actual screenshot.",
    "es": "Prueba de conexión correcta. Verifica las imágenes con una captura real."
  },
  "速记：{0}": {
    "en": "Note: {0}",
    "es": "Nota: {0}"
  },
  "请配置支持图片的模型": {
    "en": "Configure a model that supports images",
    "es": "Configura un modelo compatible con imágenes"
  },
  "图片": {
    "en": "Images",
    "es": "Imágenes"
  },
  "速记 · {0}": {
    "en": "Note · {0}",
    "es": "Nota · {0}"
  },
  "速记原文": {
    "en": "Original note",
    "es": "Nota original"
  },
  "截图分析": {
    "en": "Screenshot analysis",
    "es": "Análisis de captura"
  },
  "已复制": {
    "en": "Copied",
    "es": "Copiado"
  },
  "已另存为速记": {
    "en": "Saved as a note",
    "es": "Guardado como nota"
  },
  "待提取内容": {
    "en": "Content to extract",
    "es": "Contenido para extraer"
  },
  "请先勾选待办": {
    "en": "Select tasks first",
    "es": "Selecciona tareas primero"
  },
  "已添加 {0} 项待办": {
    "en": "Added {0} tasks",
    "es": "Se añadieron {0} tareas"
  },
  "已替换原文，可在结果下方撤销": {
    "en": "Original replaced. Undo is available below the result.",
    "es": "Original reemplazado. Puedes deshacer debajo del resultado."
  },
  "已恢复原文": {
    "en": "Original restored",
    "es": "Original restaurado"
  },
  "每次最多引用 4 份资料": {
    "en": "Up to 4 references per message",
    "es": "Máximo 4 referencias por mensaje"
  },
  "输入文字，Ctrl+Enter 确认": {
    "en": "Enter text; Ctrl+Enter to confirm",
    "es": "Escribe texto; Ctrl+Enter para confirmar"
  },
  "继续": {
    "en": "Resume",
    "es": "Reanudar"
  },
  "全屏": {
    "en": "Full screen",
    "es": "Pantalla completa"
  },
  "上次选区": {
    "en": "Last selection",
    "es": "Última selección"
  },
  "上次": {
    "en": "Previous",
    "es": "Anterior"
  },
  "标注颜色": {
    "en": "Annotation color",
    "es": "Color de anotación"
  },
  "线条粗细": {
    "en": "Line width",
    "es": "Grosor de línea"
  },
  "细": {
    "en": "Thin",
    "es": "Fina"
  },
  "中": {
    "en": "Medium",
    "es": "Media"
  },
  "粗": {
    "en": "Thick",
    "es": "Gruesa"
  },
  "撤销 Ctrl+Z": {
    "en": "Undo Ctrl+Z",
    "es": "Deshacer Ctrl+Z"
  },
  "重做 Ctrl+Shift+Z": {
    "en": "Redo Ctrl+Shift+Z",
    "es": "Rehacer Ctrl+Shift+Z"
  },
  "固定到桌面": {
    "en": "Pin to desktop",
    "es": "Fijar al escritorio"
  },
  "复制图片 Ctrl+C": {
    "en": "Copy image Ctrl+C",
    "es": "Copiar imagen Ctrl+C"
  },
  "取消 Esc": {
    "en": "Cancel Esc",
    "es": "Cancelar Esc"
  },
  "倒计时后开始录制": {
    "en": "Start recording after countdown",
    "es": "Grabar después de la cuenta atrás"
  },
  "完成标注并保存 Enter": {
    "en": "Finish and save Enter",
    "es": "Terminar y guardar Enter"
  },
  "开始录制": {
    "en": "Start recording",
    "es": "Iniciar grabación"
  },
  "完成": {
    "en": "Done",
    "es": "Listo"
  },
  "框选录制区域 · 拖动内部移动，边缘调整 · Enter 开始 · Esc 取消": {
    "en": "Select recording area · Drag inside to move, edges to resize · Enter to start · Esc to cancel",
    "es": "Selecciona el área · Arrastra dentro para mover, bordes para ajustar · Enter inicia · Esc cancela"
  },
  "拖动框选 · V 调整选区 · Ctrl+Z 撤销 · Enter 完成 · Esc 取消": {
    "en": "Drag to select · V adjust · Ctrl+Z undo · Enter finish · Esc cancel",
    "es": "Arrastra para seleccionar · V ajusta · Ctrl+Z deshace · Enter termina · Esc cancela"
  },
  "请先框选区域": {
    "en": "Select an area first",
    "es": "Selecciona un área primero"
  },
  "生成图片失败": {
    "en": "Image generation failed",
    "es": "No se pudo generar la imagen"
  },
  "准备录制 · Esc 返回选区": {
    "en": "Ready to record · Esc returns to selection",
    "es": "Listo para grabar · Esc vuelve a la selección"
  },
  "正在生成截图…": {
    "en": "Generating screenshot…",
    "es": "Generando captura…"
  },
  "图片已复制，可以继续编辑或完成保存": {
    "en": "Image copied. Keep editing or finish saving.",
    "es": "Imagen copiada. Sigue editando o termina de guardar."
  },
  "拖动控制条": {
    "en": "Drag controls",
    "es": "Arrastrar controles"
  },
  "录制时长": {
    "en": "Recording duration",
    "es": "Duración de grabación"
  },
  "暂停": {
    "en": "Pause",
    "es": "Pausar"
  },
  "结束": {
    "en": "Stop",
    "es": "Detener"
  },
  "正在准备屏幕画面…": {
    "en": "Preparing screen image…",
    "es": "Preparando imagen de pantalla…"
  },
  "打开截图失败：{0}，按 Esc 取消": {
    "en": "Could not open screenshot: {0}. Press Esc to cancel.",
    "es": "No se pudo abrir la captura: {0}. Pulsa Esc para cancelar."
  },
  "取消置顶": {
    "en": "Unpin window",
    "es": "Liberar ventana"
  },
  "固定置顶": {
    "en": "Keep on top",
    "es": "Mantener encima"
  },
  "截图-{0}.png": {
    "en": "Screenshot-{0}.png",
    "es": "Captura-{0}.png"
  },
  "保存贴图": {
    "en": "Save pinned image",
    "es": "Guardar imagen fijada"
  },
  "界面语言": {
    "en": "Interface language",
    "es": "Idioma de la interfaz"
  },
  "选择后立即生效，下次启动会保留": {
    "en": "Applies immediately and is remembered next time",
    "es": "Se aplica al instante y se conserva al reiniciar"
  },
  "保存语言设置失败：{0}": {
    "en": "Could not save language: {0}",
    "es": "No se pudo guardar el idioma: {0}"
  },
  "桌面小助手": {
    "en": "Desktop Assistant",
    "es": "Asistente de escritorio"
  },
  "新对话": {
    "en": "New chat",
    "es": "Nuevo chat"
  },
  "计算器": {
    "en": "Calculator",
    "es": "Calculadora"
  },
  "AI 聊天与内容助手": {
    "en": "AI chat and content assistant",
    "es": "Chat de IA y asistente de contenido"
  },
  "自定义": {
    "en": "Custom",
    "es": "Personalizado"
  },
  "国内": {
    "en": "China",
    "es": "China"
  },
  "国外": {
    "en": "International",
    "es": "Internacional"
  },
  "本机模型": {
    "en": "Local models",
    "es": "Modelos locales"
  },
  "自定义服务": {
    "en": "Custom service",
    "es": "Servicio personalizado"
  },
  "通义千问 · 阿里云百炼": {
    "en": "Qwen · Alibaba Cloud",
    "es": "Qwen · Alibaba Cloud"
  },
  "Kimi · 月之暗面": {
    "en": "Kimi · Moonshot",
    "es": "Kimi · Moonshot"
  },
  "智谱 GLM": {
    "en": "Zhipu GLM",
    "es": "Zhipu GLM"
  },
  "豆包 · 火山方舟": {
    "en": "Doubao · Volcengine",
    "es": "Doubao · Volcengine"
  },
  "硅基流动": {
    "en": "SiliconFlow",
    "es": "SiliconFlow"
  },
  "腾讯混元 · TokenHub": {
    "en": "Tencent Hunyuan · TokenHub",
    "es": "Tencent Hunyuan · TokenHub"
  },
  "百度文心 · 千帆": {
    "en": "Baidu ERNIE · Qianfan",
    "es": "Baidu ERNIE · Qianfan"
  },
  "填写支持流式 Chat Completions 的服务地址与模型 ID。": {
    "en": "Enter a streaming Chat Completions URL and model ID.",
    "es": "Introduce una URL de Chat Completions en streaming y un ID de modelo."
  },
  "使用 DeepSeek 开放平台的 API 密钥。": {
    "en": "Use a DeepSeek API key.",
    "es": "Usa una clave API de DeepSeek."
  },
  "默认北京地域；其他地域或工作空间请替换为控制台提供的兼容地址。": {
    "en": "Defaults to Beijing. Use the console URL for other regions or workspaces.",
    "es": "Predeterminado: Pekín. Usa la URL de la consola para otras regiones o espacios."
  },
  "使用 Kimi 开放平台 API 密钥。": {
    "en": "Use a Kimi platform API key.",
    "es": "Usa una clave API de la plataforma Kimi."
  },
  "此处为标准 API；Coding Plan 的密钥和专属地址不同。": {
    "en": "Standard API endpoint. Coding Plan uses a separate key and URL.",
    "es": "API estándar. Coding Plan usa una clave y URL distintas."
  },
  "填写已开通的模型 ID 或推理接入点 ep-…；此处为标准 API 地址。": {
    "en": "Enter an enabled model ID or ep-… endpoint. This is the standard API URL.",
    "es": "Introduce un ID habilitado o endpoint ep-…. Esta es la URL de la API estándar."
  },
  "使用开放平台 API 密钥；订阅套餐请按对应文档修改地址。": {
    "en": "Use a platform API key. For subscriptions, use the URL in your plan documentation.",
    "es": "Usa una clave de la plataforma. Para suscripciones, consulta la URL en la documentación del plan."
  },
  "模型 ID 包含组织前缀，请以账号可用模型列表为准。": {
    "en": "Include the organization prefix in the model ID. Check your available models.",
    "es": "Incluye el prefijo de organización en el ID. Consulta los modelos disponibles de tu cuenta."
  },
  "默认广州地域，填写 TokenHub 控制台已开通的模型 ID。": {
    "en": "Defaults to Guangzhou. Enter a model ID enabled in TokenHub.",
    "es": "Predeterminado: Cantón. Introduce un ID habilitado en TokenHub."
  },
  "填写千帆模型列表中的 model 值；使用 API Key 鉴权。": {
    "en": "Enter the model value from the Qianfan list. Uses API key authentication.",
    "es": "Introduce el valor model de la lista de Qianfan. Autenticación con clave API."
  },
  "使用 OpenAI API 密钥；ChatGPT 订阅不等同于 API 额度。": {
    "en": "Use an OpenAI API key. ChatGPT subscriptions do not include API credits.",
    "es": "Usa una clave API de OpenAI. Las suscripciones a ChatGPT no incluyen créditos de API."
  },
  "使用官方 OpenAI 兼容接口和工作空间级 API 密钥。": {
    "en": "Uses the official OpenAI-compatible endpoint and a workspace API key.",
    "es": "Usa el endpoint oficial compatible con OpenAI y una clave API de espacio de trabajo."
  },
  "使用 Google AI Studio 的 Gemini API 密钥。": {
    "en": "Use a Gemini API key from Google AI Studio.",
    "es": "Usa una clave API de Gemini de Google AI Studio."
  },
  "使用旧版 Chat Completions 兼容接口；不包含 Responses 专属能力。": {
    "en": "Uses legacy Chat Completions compatibility; Responses-only features are not included.",
    "es": "Usa la compatibilidad con Chat Completions heredada; no incluye funciones exclusivas de Responses."
  },
  "使用 Mistral Studio 的 API 密钥。": {
    "en": "Use a Mistral Studio API key.",
    "es": "Usa una clave API de Mistral Studio."
  },
  "填写 Groq 控制台当前可用的模型 ID。": {
    "en": "Enter a model ID currently available in the Groq console.",
    "es": "Introduce un ID disponible actualmente en la consola de Groq."
  },
  "填写平台完整模型 ID；图片能力按实际模型开启。": {
    "en": "Enter the full model ID. Enable images only for supported models.",
    "es": "Introduce el ID completo. Activa las imágenes solo para modelos compatibles."
  },
  "先启动 Ollama，填写已下载的模型名称。本机服务通常无需密钥。": {
    "en": "Start Ollama and enter a downloaded model name. Local services usually need no key.",
    "es": "Inicia Ollama e introduce un modelo descargado. Los servicios locales normalmente no necesitan clave."
  },
  "先在 LM Studio 启动服务，填写已加载的模型 ID。": {
    "en": "Start the LM Studio server and enter a loaded model ID.",
    "es": "Inicia el servidor de LM Studio e introduce el ID de un modelo cargado."
  },
  "选区 (V)": {
    "en": "Selection (V)",
    "es": "Selección (V)"
  },
  "画笔 (P)": {
    "en": "Pen (P)",
    "es": "Lápiz (P)"
  },
  "箭头 (A)": {
    "en": "Arrow (A)",
    "es": "Flecha (A)"
  },
  "矩形 (R)": {
    "en": "Rectangle (R)",
    "es": "Rectángulo (R)"
  },
  "椭圆 (O)": {
    "en": "Ellipse (O)",
    "es": "Elipse (O)"
  },
  "文字 (T)": {
    "en": "Text (T)",
    "es": "Texto (T)"
  },
  "马赛克 (M)": {
    "en": "Mosaic (M)",
    "es": "Mosaico (M)"
  },
  "序号 (N)": {
    "en": "Number (N)",
    "es": "Número (N)"
  },
  "截图贴图": {
    "en": "Pinned screenshot",
    "es": "Captura fijada"
  },
  "固定到桌面的截图": {
    "en": "Screenshot pinned to desktop",
    "es": "Captura fijada al escritorio"
  },
  "贴图操作": {
    "en": "Image actions",
    "es": "Acciones de imagen"
  },
  "另存截图": {
    "en": "Save screenshot as",
    "es": "Guardar captura como"
  },
  "关闭贴图 Esc": {
    "en": "Close image Esc",
    "es": "Cerrar imagen Esc"
  },
  "正在加载截图…": {
    "en": "Loading screenshot…",
    "es": "Cargando captura…"
  },
  "添加{0}": {
    "en": "Add {0}",
    "es": "Añadir {0}"
  },
  "编辑{0}": {
    "en": "Edit {0}",
    "es": "Editar {0}"
  },
  "搜索{0}…": {
    "en": "Search {0}…",
    "es": "Buscar {0}…"
  },
  "{0}的更多操作": {
    "en": "More actions for {0}",
    "es": "Más acciones de {0}"
  },
  "{0}快捷键": {
    "en": "{0} shortcut",
    "es": "Atajo de {0}"
  },
  "保存{0}快捷键": {
    "en": "Save {0} shortcut",
    "es": "Guardar atajo de {0}"
  },
  "停用{0}快捷键": {
    "en": "Disable {0} shortcut",
    "es": "Desactivar atajo de {0}"
  },
  "{0}默认保存目录": {
    "en": "Default folder for {0}",
    "es": "Carpeta predeterminada de {0}"
  },
  "项目与应用的路径属于各自的电脑。以后开启同步后，可在“{0}”上绑定此档案并添加入口。": {
    "en": "Paths belong to each computer. When sync is available, link this profile on “{0}” and add shortcuts.",
    "es": "Las rutas pertenecen a cada equipo. Cuando haya sincronización, vincula este perfil en «{0}» y añade accesos."
  },
  "算式过长": {
    "en": "Expression too long",
    "es": "Operación demasiado larga"
  },
  "请输入算式": {
    "en": "Enter an expression",
    "es": "Introduce una operación"
  },
  "仅支持数字、括号和四则运算": {
    "en": "Only numbers, parentheses and basic arithmetic are supported",
    "es": "Solo se admiten números, paréntesis y operaciones básicas"
  },
  "计算结果超出范围": {
    "en": "Result out of range",
    "es": "Resultado fuera de rango"
  },
  "括号或符号嵌套过多": {
    "en": "Too many nested parentheses or signs",
    "es": "Demasiados paréntesis o signos anidados"
  },
  "括号不匹配": {
    "en": "Unmatched parentheses",
    "es": "Paréntesis sin pareja"
  },
  "算式不完整": {
    "en": "Incomplete expression",
    "es": "Operación incompleta"
  },
  "不能除以零": {
    "en": "Cannot divide by zero",
    "es": "No se puede dividir entre cero"
  },
  "请输入模型名称": {
    "en": "Enter a model ID",
    "es": "Introduce un ID de modelo"
  },
  "请输入有效的模型服务地址": {
    "en": "Enter a valid service URL",
    "es": "Introduce una URL de servicio válida"
  },
  "模型配置不存在，请重新选择": {
    "en": "Model configuration no longer exists. Select another.",
    "es": "La configuración ya no existe. Selecciona otra."
  },
  "请输入有效的翻译语言": {
    "en": "Enter a valid translation language",
    "es": "Introduce un idioma de traducción válido"
  },
  "配置名称需为 1～80 字": {
    "en": "Configuration name must be 1–80 characters",
    "es": "El nombre debe tener entre 1 y 80 caracteres"
  },
  "无法保存密钥到系统凭据库": {
    "en": "Could not save the key in the system credential vault",
    "es": "No se pudo guardar la clave en el almacén de credenciales"
  },
  "系统凭据库不可用": {
    "en": "System credential vault unavailable",
    "es": "Almacén de credenciales no disponible"
  },
  "翻译文字（AI）": { "en": "Translate text (AI)", "es": "Traducir texto (IA)" },
  "自动翻译截图文字": { "en": "Translate screenshot text automatically", "es": "Traducir texto de capturas automáticamente" },
  "需要 AI 模型": { "en": "Requires an AI model", "es": "Requiere un modelo de IA" },
  "将识别文字发送到当前 AI 模型：中文译成英文，英文译成中文。需启用 AI 并选中模型。": { "en": "Send recognized text to the selected AI model: Chinese to English, English to Chinese. Enable AI and select a model first.", "es": "Envía el texto al modelo de IA seleccionado: chino a inglés e inglés a chino. Activa IA y selecciona un modelo." },
  "译文": { "en": "Translation", "es": "Traducción" },
  "复制译文": { "en": "Copy translation", "es": "Copiar traducción" },
  "重试翻译": { "en": "Retry translation", "es": "Reintentar traducción" },
  "正在翻译…": { "en": "Translating…", "es": "Traduciendo…" },
  "翻译失败：{0}": { "en": "Translation failed: {0}", "es": "Error de traducción: {0}" },
  "文字过长，请缩小截图选区后翻译": { "en": "Too much text. Select a smaller area to translate.", "es": "Demasiado texto. Selecciona un área más pequeña para traducir." },
  "请先在设置中选择一个 AI 模型": { "en": "Select an AI model in Settings first", "es": "Selecciona primero un modelo de IA en Ajustes" },
  "识别文字": { "en": "Recognize text", "es": "Reconocer texto" },
  "关闭文字识别": { "en": "Close text recognition", "es": "Cerrar reconocimiento de texto" },
  "未识别到文字，可调整选区后重新识别": { "en": "No text found. Adjust the selection and try again.", "es": "No se encontró texto. Ajusta la selección e inténtalo de nuevo." },
  "自动识别截图文字": { "en": "Recognize screenshot text automatically", "es": "Reconocer texto de capturas automáticamente" },
  "开启后框选即识别；关闭后点击截图工具栏的「识别文字」。": { "en": "When enabled, recognize after selecting a region. Otherwise, use Recognize text in the capture toolbar.", "es": "Si está activado, reconoce al seleccionar una región. Si no, usa Reconocer texto en la barra de captura." },
  "AI 功能已启用": { "en": "AI features enabled", "es": "Funciones de IA activadas" },
  "识别文字（本地）": { "en": "Recognized text · offline", "es": "Texto reconocido · sin conexión" },
  "复制文字": { "en": "Copy text", "es": "Copiar texto" },
  "重新识别": { "en": "Retry OCR", "es": "Reintentar OCR" },
  "正在本地识别文字…": { "en": "Recognizing text locally…", "es": "Reconociendo texto localmente…" },
  "截图中的文字": { "en": "Text in screenshot", "es": "Texto de la captura" },
  "本地文字识别失败：{0}": { "en": "Local text recognition failed: {0}", "es": "Error de reconocimiento local: {0}" },
  "文字已复制": { "en": "Text copied", "es": "Texto copiado" },
  "设置文件（JSON）": { "en": "Settings file (JSON)", "es": "Archivo de ajustes (JSON)" },
  "可直接编辑 settings.json，修正后重新加载即可生效。": { "en": "Edit settings.json directly, then reload to apply your changes.", "es": "Edita settings.json y vuelve a cargar para aplicar los cambios." },
  "配置文件有误，当前使用默认配置": { "en": "Invalid settings file. Default settings are in use.", "es": "Archivo de ajustes inválido. Se usan los valores predeterminados." },
  "原文件已保留，修正后重新加载。": { "en": "Your file is preserved. Fix it, then reload.", "es": "Se conserva tu archivo. Corrígelo y vuelve a cargar." },
  "部分设置将在当前任务结束后重新加载时生效": { "en": "Some settings need to be reloaded after the current task finishes.", "es": "Algunos ajustes se aplicarán al recargar tras finalizar la tarea actual." },
  "编辑 JSON": { "en": "Edit JSON", "es": "Editar JSON" },
  "外部编辑器打开": { "en": "External editor", "es": "Editor externo" },
  "重新加载": { "en": "Reload", "es": "Recargar" },
  "保存前校验 JSON 语法、字段类型和配置值。": { "en": "JSON syntax, field types and values are checked before saving.", "es": "Se validan la sintaxis JSON, los tipos y los valores antes de guardar." },
  "JSON 设置内容": { "en": "JSON settings content", "es": "Contenido de ajustes JSON" },
  "查看默认配置": { "en": "View defaults", "es": "Ver valores predeterminados" },
  "格式化": { "en": "Format", "es": "Formatear" },
  "校验并保存": { "en": "Validate and save", "es": "Validar y guardar" },
  "正在校验…": { "en": "Validating…", "es": "Validando…" },
  "配置格式正确，可以保存": { "en": "Settings are valid and ready to save", "es": "Los ajustes son válidos y se pueden guardar" },
  "JSON 修改尚未保存，确定关闭吗？": { "en": "JSON changes are not saved. Close anyway?", "es": "Los cambios JSON no se han guardado. ¿Cerrar de todos modos?" },
  "JSON 设置已保存": { "en": "JSON settings saved", "es": "Ajustes JSON guardados" },
  "另存为本地图片 Ctrl+S": {
    "en": "Save image as… Ctrl+S",
    "es": "Guardar imagen como… Ctrl+S"
  },
  "请使用 .png 文件扩展名": {
    "en": "Use the .png file extension",
    "es": "Usa la extensión de archivo .png"
  },
  "图片已保存到：{0}": {
    "en": "Image saved to: {0}",
    "es": "Imagen guardada en: {0}"
  },
  "截图保存失败：{0}": {
    "en": "Could not save screenshot: {0}",
    "es": "No se pudo guardar la captura: {0}"
  },
  "快捷键 {0} 注册失败，请检查组合键是否被其他程序使用：{1}": {
    "en": "Could not register shortcut {0}. Check whether another app uses it: {1}",
    "es": "No se pudo registrar el atajo {0}. Comprueba si otra aplicación lo usa: {1}"
  },
  "无法释放原快捷键 {0}：{1}": {
    "en": "Could not release previous shortcut {0}: {1}",
    "es": "No se pudo liberar el atajo anterior {0}: {1}"
  },
  "快捷键设置保存失败：{0}": {
    "en": "Could not save shortcut settings: {0}",
    "es": "No se pudo guardar la configuración de atajos: {0}"
  },
  "；恢复原快捷键时出错，请重启应用：{0}": {
    "en": "; Could not restore the previous shortcut. Restart the app: {0}",
    "es": "; No se pudo restaurar el atajo anterior. Reinicia la aplicación: {0}"
  },
  "截图与录屏快捷键不能相同": {
    "en": "Screenshot and recording shortcuts must be different",
    "es": "Los atajos de captura y grabación deben ser diferentes"
  },
  "正在保存快捷键，请稍候": {
    "en": "Saving shortcuts, please wait",
    "es": "Guardando atajos, espera un momento"
  },
  "请使用 Ctrl、Alt 或 Win/⌘ 搭配字母、数字、功能键等组合": {
    "en": "Combine Ctrl, Alt or Win/⌘ with a letter, number or function key",
    "es": "Combina Ctrl, Alt o Win/⌘ con una letra, un número o una tecla de función"
  },
  "截图后自动显示识别文字": { "en": "Show recognized text after capture", "es": "Mostrar texto reconocido tras capturar" },
  "截图后自动显示译文": { "en": "Translate and show results after capture", "es": "Traducir y mostrar resultados tras capturar" },
  "开启后自动显示识别原文，可在面板内点击「翻译」。关闭后，通过工具栏的「识别文字」手动打开。": { "en": "Automatically show recognized text, with a Translate button in the panel. When off, open it manually with Recognize text in the toolbar.", "es": "Muestra el texto reconocido con un botón Traducir en el panel. Si se desactiva, ábrelo con Reconocer texto en la barra." },
  "开启后自动翻译并显示译文，不会连带打开识别原文；关闭后可点击工具栏的「翻译」。仅发送识别文字，中文译英文、英文译中文，需启用 AI 并选中模型。": { "en": "Automatically translate and show the translation without opening the source text. When off, click Translate in the toolbar. Only recognized text is sent to the selected AI model, translating between Chinese and English. AI must be enabled and a model selected.", "es": "Traduce y muestra la traducción sin abrir el texto original. Si se desactiva, pulsa Traducir en la barra. Solo se envía el texto reconocido al modelo de IA seleccionado para traducir entre chino e inglés. Requiere activar la IA y seleccionar un modelo." },
  "正在准备录制…": { "en": "Preparing recording…", "es": "Preparando la grabación…" },
  "还没有模型，点击「添加模型」开始配置。": { "en": "No models yet. Click Add model to get started.", "es": "Aún no hay modelos. Pulsa Añadir modelo para empezar." },
  "模型修改尚未保存，确定放弃修改吗？": { "en": "Discard unsaved model changes?", "es": "¿Descartar los cambios del modelo sin guardar?" },
  "关闭模型配置": { "en": "Close model configuration", "es": "Cerrar configuración del modelo" },
  "选择模型": { "en": "Choose a model", "es": "Elegir un modelo" },
  "请先获取模型列表": { "en": "Fetch the model list first", "es": "Obtén primero la lista de modelos" },
  "已获取 {0} 个模型，点击输入框右侧箭头选择。": { "en": "Fetched {0} models. Use the arrow beside an input to choose one.", "es": "Se obtuvieron {0} modelos. Usa la flecha junto al campo para elegir uno." },
  "模型映射": { "en": "Model mappings", "es": "Asignaciones de modelos" },
  "显示名称便于辨认，实际模型用于请求。选择一条作为此配置的当前模型，保存后生效。": { "en": "Names are for display; requests use the actual model. Select one for this configuration and save to apply.", "es": "El nombre se muestra en pantalla; las solicitudes usan el modelo real. Selecciona uno y guarda para aplicar." },
  "添加映射": { "en": "Add mapping", "es": "Añadir asignación" },
  "一键设置": { "en": "Quick setup", "es": "Configuración rápida" },
  "正在获取…": { "en": "Fetching…", "es": "Obteniendo…" },
  "获取模型列表": { "en": "Fetch models", "es": "Obtener modelos" },
  "一键设置会补入当前服务的常用模型，保留已有映射。": { "en": "Quick setup adds this provider's model presets and keeps existing mappings.", "es": "La configuración rápida añade modelos predefinidos del proveedor y conserva las asignaciones existentes." },
  "使用此模型": { "en": "Use this model", "es": "Usar este modelo" },
  "显示名称": { "en": "Display name", "es": "Nombre visible" },
  "实际模型": { "en": "Actual model", "es": "Modelo real" },
  "服务返回的模型": { "en": "Models from this service", "es": "Modelos de este servicio" },
  "搜索模型": { "en": "Search models", "es": "Buscar modelos" },
  "添加所选模型": { "en": "Add selected models", "es": "Añadir modelos seleccionados" },
  "模型列表不保证图片能力，请按服务说明设置。每个配置最多 50 条映射。": { "en": "The list does not confirm image support; check the provider's documentation. Up to 50 mappings per configuration.", "es": "La lista no confirma compatibilidad con imágenes; consulta al proveedor. Máximo 50 asignaciones por configuración." },
  "没有匹配的模型，可手动添加映射。": { "en": "No matching models. You can add mappings manually.", "es": "No hay modelos coincidentes. Puedes añadir asignaciones manualmente." },
  "模型映射最多添加 50 条": { "en": "Up to 50 model mappings are allowed", "es": "Se permiten hasta 50 asignaciones de modelos" },
  "模型映射名称须为 1～80 字符且不能重复": { "en": "Mapping names must be unique and contain 1–80 characters", "es": "Los nombres deben ser únicos y tener entre 1 y 80 caracteres" },
  "实际模型须为 1～200 字符且不能重复或包含控制字符": { "en": "Actual models must be unique, contain 1–200 characters and no control characters", "es": "Los modelos reales deben ser únicos, tener entre 1 y 200 caracteres y no incluir caracteres de control" },
  "请在模型映射中选中一个模型": { "en": "Select a model in the mappings", "es": "Selecciona un modelo en las asignaciones" },
  "模型列表格式不兼容，请手动添加模型映射": { "en": "Unsupported model list format. Add mappings manually.", "es": "Formato de lista incompatible. Añade las asignaciones manualmente." },
  "获取模型列表认证失败，请检查 API 密钥和访问权限": { "en": "Model list authentication failed. Check the API key and permissions.", "es": "Falló la autenticación. Revisa la clave API y los permisos." },
  "该服务不支持模型列表接口，请手动添加模型映射": { "en": "This service does not support listing models. Add mappings manually.", "es": "El servicio no permite listar modelos. Añade las asignaciones manualmente." },
  "获取模型列表失败，请检查服务状态或稍后重试": { "en": "Could not fetch models. Check the service status or try again later.", "es": "No se pudieron obtener los modelos. Revisa el servicio o inténtalo más tarde." },
  "模型列表过大，请手动添加模型映射": { "en": "The model list is too large. Add mappings manually.", "es": "La lista es demasiado grande. Añade las asignaciones manualmente." },
  "翻译": { "en": "Translate", "es": "Traducir" },
  "关闭结果": { "en": "Close results", "es": "Cerrar resultados" },
  "正在读取截图文字…": { "en": "Reading screenshot text…", "es": "Leyendo el texto de la captura…" },
  "连接失败或超时，请检查服务地址和网络": {
    "en": "Connection failed or timed out. Check the URL and network.",
    "es": "La conexión falló o agotó el tiempo. Revisa la URL y la red."
  },
  "{0} 秒倒计时": {"en":"{0}s countdown","es":"Cuenta atrás de {0}s"},
  "无声录制": {"en":"No audio","es":"Sin audio"},
  "停止录制": {"en":"Stop recording","es":"Detener grabación"},
  "截图设置": {"en":"Screenshot settings","es":"Ajustes de captura"},
  "录屏设置": {"en":"Recording settings","es":"Ajustes de grabación"},
  "关于": {"en":"About","es":"Acerca de"},
  "主导航": {"en":"Main navigation","es":"Navegación principal"},
  "录屏已暂停": {"en":"Recording paused","es":"Grabación pausada"},
  "录屏进行中": {"en":"Recording in progress","es":"Grabación en curso"},
  "当前没有录屏": {"en":"No active recording","es":"No hay grabación activa"},
  "提醒时间：{0}": {"en":"Reminder time: {0}","es":"Hora del recordatorio: {0}"},
  "版本号": {"en":"Version","es":"Versión"},
  "暂不可用": {"en":"Unavailable","es":"No disponible"},
  "维护者": {"en":"Maintainer","es":"Responsable"},
  "开源许可": {"en":"License","es":"Licencia"},
  "项目仓库": {"en":"Repository","es":"Repositorio"},
  "记录待办与速记，管理项目和应用，随手截图、录屏与设置提醒。": {"en":"Keep tasks and notes, manage projects and apps, capture your screen, and set reminders.","es":"Guarda tareas y notas, organiza proyectos y aplicaciones, captura y graba la pantalla y programa recordatorios."},
  "操作小助手": {"en": "Operate Assistant", "es": "Operar el asistente"},
  "可创建待办、速记、提醒及调用截图录屏": {"en": "Create tasks, notes and reminders, or capture your screen", "es": "Crea tareas, notas y recordatorios, o captura y graba la pantalla"},
  "正在执行": {"en": "Running", "es": "En curso"},
  "等待框选操作": {"en": "Waiting for selection", "es": "Esperando selección"},
  "已完成": {"en": "Completed", "es": "Completado"},
  "执行失败": {"en": "Failed", "es": "Falló"},
  "已取消": {"en": "Cancelled", "es": "Cancelado"},
  "结果待确认": {"en": "Result unconfirmed", "es": "Resultado sin confirmar"},
  "本机操作记录": {"en": "Local action log", "es": "Registro de acciones locales"},
  "请在原生界面完成框选；图片和视频不会自动发送给 AI。": {"en": "Finish selecting in the native window. Images and videos are not sent to AI automatically.", "es": "Completa la selección en la ventana nativa. Las imágenes y vídeos no se envían a la IA automáticamente."},
  "操作可能已提交，请检查对应列表或录屏状态。": {"en": "The action may have been submitted. Check the relevant list or recording status.", "es": "La acción podría haberse enviado. Revisa la lista o el estado de grabación."},
  "已读取此前操作结果，未重复执行": {"en": "Previous result restored; action was not repeated", "es": "Resultado anterior recuperado; la acción no se repitió"},
  "创建待办": {"en": "Create task", "es": "Crear tarea"},
  "创建提醒": {"en": "Create reminder", "es": "Crear recordatorio"},
  "调用截图": {"en": "Open screenshot", "es": "Abrir captura"},
  "开始录屏": {"en": "Start recording", "es": "Iniciar grabación"},
  "暂停录屏": {"en": "Pause recording", "es": "Pausar grabación"},
  "继续录屏": {"en": "Resume recording", "es": "Reanudar grabación"},
  "停止录屏": {"en": "Stop recording", "es": "Detener grabación"},
  "查询录屏状态": {"en": "Recording status", "es": "Estado de grabación"},
  "本机操作": {"en": "Local action", "es": "Acción local"},
  "截图已复制": {"en": "Screenshot copied", "es": "Captura copiada"},
  "截图已保存": {"en": "Screenshot saved", "es": "Captura guardada"},
  "截图已固定到桌面": {"en": "Screenshot pinned to desktop", "es": "Captura fijada en el escritorio"},
  "录屏已停止，请到录屏页保存": {"en": "Recording stopped. Save it from the recording page.", "es": "Grabación detenida. Guárdala desde la página de grabación."},
  "已取消操作": {"en": "Action cancelled", "es": "Acción cancelada"},
  "操作结果已更新": {"en": "Action result updated", "es": "Resultado de la acción actualizado"},
  "录屏已开始": {"en": "Recording started", "es": "Grabación iniciada"},
  "服务拒绝了工具调用请求，请检查模型是否支持工具调用，或关闭“操作小助手”后重试聊天": {"en": "The service rejected this tool request. Check tool support or turn off Operate Assistant to continue chatting.", "es": "El servicio rechazó la solicitud de herramienta. Comprueba su compatibilidad o desactiva Operar el asistente para seguir chateando."},
  "录屏已停止并完成封装，请在录屏页预览并选择保存位置": {"en": "Recording stopped and finalized. Preview and save it from the recording page.", "es": "Grabación detenida y finalizada. Previsualízala y guárdala desde la página de grabación."},
  "恢复默认设置": {"en":"Restore default settings","es":"Restaurar ajustes predeterminados"},
  "恢复默认": {"en":"Restore defaults","es":"Restaurar valores"},
  "恢复窗口、语言、功能显示和截图录屏偏好，保留业务数据与 AI 配置。": {"en":"Reset window, language, feature visibility and capture preferences. Keep your data and AI configuration.","es":"Restablece ventana, idioma, funciones y preferencias de captura. Conserva tus datos y la configuración de IA."},
  "恢复窗口大小、语言、功能顺序、置顶、开机启动、快捷键及截图录屏偏好？待办、速记、项目、应用、提醒、历史记录及 AI 配置会保留。": {"en":"Reset window size, language, feature order, always on top, autostart, shortcuts and capture preferences? Tasks, notes, projects, apps, reminders, history and AI configuration will be kept.","es":"¿Restablecer tamaño de ventana, idioma, orden de funciones, primer plano, inicio automático, atajos y captura? Se conservarán tareas, notas, proyectos, aplicaciones, recordatorios, historial y configuración de IA."},
  "已恢复默认设置": {"en":"Default settings restored","es":"Ajustes predeterminados restaurados"},
  "常规设置": {"en":"General","es":"General"},
  "高级设置": {"en":"Advanced","es":"Avanzado"},
  "设置分类": {"en":"Settings categories","es":"Categorías de ajustes"},
  "返回 AI 会话": {"en": "Back to AI chats", "es": "Volver a chats de IA"},
  "我": {"en": "Me", "es": "Yo"},
  "已移除的联系人": {"en": "Removed contact", "es": "Contacto eliminado"},
  "历史对话": {"en": "Previous conversation", "es": "Conversación anterior"},
  "服务已移除": {"en": "Service removed", "es": "Servicio eliminado"},
  "聊天": {"en": "Chats", "es": "Chats"},
  "通讯录": {"en": "Contacts", "es": "Contactos"},
  "添加 AI 联系人": {"en": "Add AI contact", "es": "Añadir contacto de IA"},
  "新建群组": {"en": "New group", "es": "Nuevo grupo"},
  "搜索聊天或联系人": {"en": "Search chats or contacts", "es": "Buscar chats o contactos"},
  "有任务进行中": {"en": "Tasks in progress", "es": "Tareas en curso"},
  "开始聊天": {"en": "Start chatting", "es": "Iniciar chat"},
  "可使用": {"en": "Available", "es": "Disponible"},
  "需配置": {"en": "Setup needed", "es": "Requiere configuración"},
  "编辑联系人": {"en": "Edit contact", "es": "Editar contacto"},
  "暂无记录": {"en": "Nothing here yet", "es": "Aún no hay registros"},
  "未检测": {"en": "Not checked", "es": "Sin comprobar"},
  "安装": {"en": "Install", "es": "Instalar"},
  "添加为联系人": {"en": "Add as contact", "es": "Añadir como contacto"},
  "安装执行端": {"en": "Install CLI", "es": "Instalar CLI"},
  "重新检测": {"en": "Check again", "es": "Comprobar de nuevo"},
  "正在安装…": {"en": "Installing…", "es": "Instalando…"},
  "和你的 AI 一起工作": {"en": "Work with your AI", "es": "Trabaja con tu IA"},
  "从通讯录开始私聊，或创建群组安排协作任务。": {"en": "Start a private chat from Contacts, or create a group to coordinate tasks.", "es": "Inicia un chat privado desde Contactos o crea un grupo para coordinar tareas."},
  "本机 CLI 可以独立使用，无需在小助手中配置 API 密钥。": {"en": "Local CLIs work independently of API keys configured in Assistant.", "es": "Las CLI locales funcionan sin configurar claves API en el asistente."},
  "配置模型服务": {"en": "Configure model service", "es": "Configurar servicio de modelos"},
  "全部消息": {"en": "All messages", "es": "Todos los mensajes"},
  "仅看 {0}": {"en": "Only {0}", "es": "Solo {0}"},
  "已选 {0} 人": {"en": "{0} selected", "es": "{0} seleccionados"},
  "展开或收起列表": {"en": "Toggle conversation list", "es": "Mostrar u ocultar lista"},
  "{0} 位 AI 成员": {"en": "{0} AI members", "es": "{0} miembros de IA"},
  "群组设置": {"en": "Group settings", "es": "Ajustes del grupo"},
  "删除会话": {"en": "Delete conversation", "es": "Eliminar conversación"},
  "恢复全部": {"en": "Show everyone", "es": "Mostrar todos"},
  "负责人": {"en": "Lead", "es": "Responsable"},
  "加载更早的消息": {"en": "Load earlier messages", "es": "Cargar mensajes anteriores"},
  "当前筛选下没有消息": {"en": "No messages match this filter", "es": "No hay mensajes con este filtro"},
  "发送消息，开始这次协作。": {"en": "Send a message to start working together.", "es": "Envía un mensaje para empezar a colaborar."},
  "@成员分配任务；可安排完成后检查": {"en": "@ a member to assign work; arrange reviews after completion", "es": "Menciona a un miembro con @ para asignar tareas y revisiones"},
  "告诉这位 AI 要完成什么": {"en": "Tell this AI what to do", "es": "Indica a esta IA qué hacer"},
  "Enter 发送，Shift+Enter 换行": {"en": "Enter to send, Shift+Enter for a new line", "es": "Enter para enviar, Mayús+Enter para nueva línea"},
  "停止任务": {"en": "Stop tasks", "es": "Detener tareas"},
  "只看该成员": {"en": "Only show this member", "es": "Ver solo este miembro"},
  "正在执行…": {"en": "Working…", "es": "Ejecutando…"},
  "执行记录": {"en": "Activity", "es": "Actividad"},
  "协作任务": {"en": "Shared tasks", "es": "Tareas del grupo"},
  "等待 {0}": {"en": "Waiting for {0}", "es": "Esperando a {0}"},
  "停止": {"en": "Stop", "es": "Detener"},
  "重新分配": {"en": "Assign again", "es": "Asignar de nuevo"},
  "需要你的确认": {"en": "Your approval is needed", "es": "Se necesita tu aprobación"},
  "查看操作": {"en": "Inspect action", "es": "Ver operación"},
  "允许本次": {"en": "Allow once", "es": "Permitir una vez"},
  "拒绝": {"en": "Deny", "es": "Rechazar"},
  "联系人已移除": {"en": "Contact removed", "es": "Contacto eliminado"},
  "执行端尚未就绪，请配置模型或检测本机 CLI": {"en": "The agent is not ready. Configure its model or check the local CLI.", "es": "El agente no está listo. Configura su modelo o comprueba la CLI local."},
  "任务已停止": {"en": "Task stopped", "es": "Tarea detenida"},
  "执行权限": {"en": "Execution permissions", "es": "Permisos de ejecución"},
  "工作目录": {"en": "Working directory", "es": "Directorio de trabajo"},
  "需要读写项目时选择目录": {"en": "Select a directory to work with project files", "es": "Selecciona un directorio para trabajar con archivos"},
  "额外授权目录（每行一个）": {"en": "Additional directories, one per line", "es": "Directorios adicionales, uno por línea"},
  "写操作逐项确认": {"en": "Approve each write operation", "es": "Aprobar cada operación de escritura"},
  "启动任务前确认": {"en": "Approve before starting a task", "es": "Aprobar antes de iniciar una tarea"},
  "允许操作小助手工具": {"en": "Allow Assistant tools", "es": "Permitir herramientas del asistente"},
  "允许执行系统命令": {"en": "Allow shell commands", "es": "Permitir comandos del sistema"},
  "允许观察和控制桌面（Windows，需图片模型）": {"en": "Allow desktop observation and control (Windows, vision model required)", "es": "Permitir ver y controlar el escritorio (Windows, requiere modelo visual)"},
  "命令按当前系统用户运行，不提供系统级目录或网络隔离。": {"en": "Commands run as the current system user, without OS-level directory or network isolation.", "es": "Los comandos se ejecutan con el usuario actual, sin aislamiento de directorios o red a nivel del sistema."},
  "CLI 使用自身的权限机制；跟随原程序时不覆盖配置。Windows 下 Claude Code 命令没有系统沙箱。": {"en": "CLIs use their own permission mechanisms. Inherit keeps their settings. Claude Code commands on native Windows have no OS sandbox.", "es": "Las CLI usan sus propios permisos. Heredar conserva su configuración. Los comandos de Claude Code en Windows nativo no tienen aislamiento del sistema."},
  "完全访问可触及项目以外的文件与命令，范围仍受系统用户权限和执行端策略限制。": {"en": "Full access may reach files and commands outside the project, within system-user and agent policy limits.", "es": "El acceso completo puede llegar a archivos y comandos fuera del proyecto, sujeto a los permisos del usuario y del agente."},
  "联系人名称": {"en": "Contact name", "es": "Nombre del contacto"},
  "别名（逗号分隔）": {"en": "Aliases, comma-separated", "es": "Alias, separados por comas"},
  "接入类型": {"en": "Agent type", "es": "Tipo de agente"},
  "自定义 AI": {"en": "Custom AI", "es": "IA personalizada"},
  "模型服务": {"en": "Model service", "es": "Servicio de modelos"},
  "请选择": {"en": "Select", "es": "Seleccionar"},
  "模型 ID（留空使用服务默认值）": {"en": "Model ID, blank for the service default", "es": "ID del modelo, vacío para usar el predeterminado"},
  "密钥继续使用设置中的模型服务配置。": {"en": "Keys are managed in model service settings.", "es": "Las claves se gestionan en los ajustes del servicio."},
  "程序路径（留空自动检测）": {"en": "Executable path, blank to detect automatically", "es": "Ruta del ejecutable, vacío para detectar automáticamente"},
  "检测执行端": {"en": "Check CLI", "es": "Comprobar CLI"},
  "打开原程序": {"en": "Open CLI", "es": "Abrir CLI"},
  "沿用 CLI 自己的模型和认证配置，安装检测不代表账号已经可用。": {"en": "Uses the CLI's model and authentication settings. Installation detection does not verify account access.", "es": "Usa el modelo y la autenticación de la CLI. Detectar la instalación no verifica el acceso de la cuenta."},
  "角色说明": {"en": "Role instructions", "es": "Instrucciones del rol"},
  "例如：负责实现功能，完成后报告修改和测试结果。": {"en": "For example: implement features, then report changes and test results.", "es": "Por ejemplo: implementar funciones e informar de cambios y pruebas."},
  "删除联系人": {"en": "Delete contact", "es": "Eliminar contacto"},
  "群组名称": {"en": "Group name", "es": "Nombre del grupo"},
  "选择 AI 成员": {"en": "Select AI members", "es": "Seleccionar miembros de IA"},
  "请先添加 AI 联系人": {"en": "Add an AI contact first", "es": "Añade primero un contacto de IA"},
  "最多 16 位成员；未点名的消息交给默认负责人。": {"en": "Up to 16 members. Messages without a mention go to the default lead.", "es": "Hasta 16 miembros. Los mensajes sin mención se envían al responsable predeterminado."},
  "AI 联系人": {"en": "AI contact", "es": "Contacto de IA"},
  "本次会话权限": {"en": "Conversation permissions", "es": "Permisos de la conversación"},
  "仅影响当前会话": {"en": "Applies only to this conversation", "es": "Solo se aplica a esta conversación"},
  "允许这个 AI 完全访问？它可能修改项目以外的文件或执行系统命令。": {"en": "Allow this AI full access? It may modify files outside the project or run system commands.", "es": "¿Permitir acceso completo a esta IA? Podría modificar archivos fuera del proyecto o ejecutar comandos del sistema."},
  "完全访问": {"en": "Full access", "es": "Acceso completo"},
  "联系人已保存": {"en": "Contact saved", "es": "Contacto guardado"},
  "请选择 1～16 位成员": {"en": "Select 1–16 members", "es": "Selecciona entre 1 y 16 miembros"},
  "请先停止群组任务再修改成员": {"en": "Stop group tasks before changing members", "es": "Detén las tareas del grupo antes de cambiar miembros"},
  "请先停止这个联系人的任务再调整权限": {"en": "Stop this contact's tasks before changing permissions", "es": "Detén las tareas del contacto antes de cambiar permisos"},
  "未检测到安装": {"en": "Installation not found", "es": "Instalación no encontrada"},
  "从官方来源安装 {0} 命令行程序？Codex 的此安装方式需要 Node.js/npm。": {"en": "Install {0} from its official source? This Codex installation method requires Node.js/npm.", "es": "¿Instalar {0} desde su fuente oficial? Este método de instalación de Codex requiere Node.js/npm."},
  "安装完成，请在原程序中完成登录或配置": {"en": "Installed. Complete sign-in or setup in the CLI.", "es": "Instalado. Completa el inicio de sesión o la configuración en la CLI."},
  "请检查已执行的结果，再发送新任务": {"en": "Check the work already performed before sending a new task", "es": "Comprueba el trabajo realizado antes de enviar una nueva tarea"},
  "请先停止相关任务": {"en": "Stop the related tasks first", "es": "Detén primero las tareas relacionadas"},
  "删除此会话及其任务记录？已执行的文件修改会保留。": {"en": "Delete this conversation and its task history? Existing file changes will remain.", "es": "¿Eliminar la conversación y sus tareas? Los cambios realizados en archivos se conservarán."},
  "删除联系人？历史会话会保留。": {"en": "Delete the contact? Existing conversations will remain.", "es": "¿Eliminar el contacto? Se conservarán las conversaciones anteriores."},
  "原对话": {"en": "Original chat", "es": "Chat original"},
  "查看引用": {"en": "View reference", "es": "Ver referencia"},
  "请分析这份资料。": {"en": "Please analyze this material.", "es": "Analiza este material."},
  "图片引用需要接收方使用支持图片的自定义 AI；CLI 可通过任务中的文件路径读取项目图片。": {"en": "Image attachments require a custom AI with vision support. For CLIs, reference project image paths in the task.", "es": "Las imágenes adjuntas requieren una IA personalizada con visión. Para CLI, indica las rutas de las imágenes en la tarea."},
  "最多引用四份资料": {"en": "Attach up to four references", "es": "Adjunta hasta cuatro referencias"},
  "跟随原程序": {"en": "Inherit CLI settings", "es": "Heredar ajustes de CLI"},
  "只读分析": {"en": "Read-only analysis", "es": "Análisis de solo lectura"},
  "项目内操作": {"en": "Project operations", "es": "Operaciones del proyecto"},
  "等待执行": {"en": "Queued", "es": "En cola"},
  "等待确认": {"en": "Awaiting approval", "es": "Esperando aprobación"},
  "已停止": {"en": "Stopped", "es": "Detenida"},
  "前置任务未完成": {"en": "Dependency incomplete", "es": "Dependencia incompleta"},
  "上次执行已中断": {"en": "Previous run interrupted", "es": "Ejecución anterior interrumpida"},
  "AI 设置": {"en": "AI settings", "es": "Ajustes de IA"},
  "本机 AI": {"en": "Local AI", "es": "IA local"},
  "请确认": {"en": "Please confirm", "es": "Confirma la acción"},
  "确认": {"en": "Confirm", "es": "Confirmar"},
  "删除速记": {"en": "Delete note", "es": "Eliminar nota"},
  "移除": {"en": "Remove", "es": "Quitar"},
  "放弃修改": {"en": "Discard changes", "es": "Descartar cambios"},
  "测试连通": {"en": "Test connection", "es": "Probar conexión"},
  "测试中…": {"en": "Testing…", "es": "Probando…"},
  "连接测试成功 · {0} ms；测试不会保存配置。": {"en": "Connection succeeded · {0} ms. Testing does not save this configuration.", "es": "Conexión correcta · {0} ms. La prueba no guarda esta configuración."},
  "服务错误码：{0}": {"en": "Provider error code: {0}", "es": "Código del servicio: {0}"},
  "智谱 GLM · Coding Plan": {"en": "Zhipu GLM · Coding Plan", "es": "Zhipu GLM · Coding Plan"},
  "智谱 GLM · 标准 API": {"en": "Zhipu GLM · Standard API", "es": "Zhipu GLM · API estándar"},
  "标准 API 使用开放平台余额或资源包；Coding Plan 请选择专用预设。": {"en": "The standard API uses platform credit or resource packages. Choose the dedicated preset for Coding Plan.", "es": "La API estándar usa saldo o paquetes de recursos. Para Coding Plan, elige su preajuste específico."},
  "使用 Coding Plan 的 Chat Completions 专用地址；不要填写 CC Switch 的 Anthropic 地址。": {"en": "Use the Coding Plan Chat Completions endpoint, rather than the Anthropic URL from CC Switch.", "es": "Usa el endpoint Chat Completions de Coding Plan, en lugar de la URL Anthropic de CC Switch."},
  "请检查服务地址和当前选中的实际模型。": {"en": "Check the service URL and the selected actual model ID.", "es": "Revisa la URL del servicio y el ID del modelo seleccionado."},
  "这个智谱地址是 Anthropic/Responses 通道，请选择智谱 Coding Plan 预设的 Chat Completions 地址。": {"en": "This Zhipu URL uses Anthropic/Responses. Select the Chat Completions URL in the Zhipu Coding Plan preset.", "es": "Esta URL de Zhipu usa Anthropic/Responses. Selecciona la URL Chat Completions del preajuste Coding Plan."},
  "请填写当前地址的 API 密钥；更换地址后不能沿用其他地址的已保存密钥。": {"en": "Enter the API key for this URL. Keys saved for a different URL are not reused.", "es": "Introduce la clave de esta URL. No se reutilizan claves guardadas para otras URL."},
  "服务认证失败，请核对该通道对应的密钥及账号权限。": {"en": "Authentication failed. Check the key and account permissions for this endpoint.", "es": "Falló la autenticación. Revisa la clave y los permisos de esta ruta."},
  "当前 API 通道余额不足；如果使用 Coding Plan，请选择套餐专用地址。": {"en": "This API endpoint has insufficient credit. For Coding Plan, select the plan endpoint.", "es": "Esta ruta API no tiene saldo suficiente. Para Coding Plan, selecciona la ruta del plan."},
  "当前账号或套餐额度已用完，请检查额度与重置时间。": {"en": "Account or plan quota is exhausted. Check the quota and reset time.", "es": "Se agotó la cuota de la cuenta o del plan. Revisa la cuota y la hora de reinicio."},
  "Coding Plan 套餐已到期，请检查套餐状态。": {"en": "The Coding Plan subscription has expired. Check the plan status.", "es": "La suscripción Coding Plan caducó. Revisa el estado del plan."},
  "模型不存在或当前账号无权使用，请检查实际模型 ID。": {"en": "The model is unavailable or not permitted for this account. Check the actual model ID.", "es": "El modelo no existe o la cuenta no tiene acceso. Revisa el ID real del modelo."},
  "服务地址或协议不匹配，请使用 Chat Completions 兼容地址。": {"en": "The endpoint or protocol does not match. Use a Chat Completions compatible URL.", "es": "La ruta o el protocolo no coincide. Usa una URL compatible con Chat Completions."},
  "服务拒绝了测试参数，请核对模型及接口兼容性。": {"en": "The service rejected the test parameters. Check model and API compatibility.", "es": "El servicio rechazó los parámetros de prueba. Revisa la compatibilidad del modelo y de la API."},
  "服务已响应，但没有返回有效文本；请检查模型或接口协议。": {"en": "The service responded without valid text. Check the model or API protocol.", "es": "El servicio respondió sin texto válido. Revisa el modelo o el protocolo."},
  "连接测试超过 45 秒，请检查网络或稍后重试。": {"en": "The connection test exceeded 45 seconds. Check the network or try again later.", "es": "La prueba superó los 45 segundos. Revisa la red o inténtalo más tarde."},
  "无法连接模型服务，请检查网络、代理和服务地址。": {"en": "Cannot connect to the model service. Check the network, proxy and service URL.", "es": "No se puede conectar al servicio. Revisa la red, el proxy y la URL."},
  "模型服务暂时不可用，请稍后重试。": {"en": "The model service is temporarily unavailable. Try again later.", "es": "El servicio no está disponible temporalmente. Inténtalo más tarde."},
  "连接测试已取消": {"en": "Connection test cancelled", "es": "Prueba de conexión cancelada"},
  "智谱的 Anthropic/Responses 地址不能用于 Chat Completions；Coding Plan 请使用 https://open.bigmodel.cn/api/coding/paas/v4。": {"en": "Zhipu Anthropic/Responses URLs cannot be used with Chat Completions. For Coding Plan, use https://open.bigmodel.cn/api/coding/paas/v4.", "es": "Las URL Anthropic/Responses de Zhipu no son compatibles con Chat Completions. Para Coding Plan, usa https://open.bigmodel.cn/api/coding/paas/v4."},
  "主 AI": {"en": "Primary AI", "es": "IA principal"},
  "设为主 AI": {"en": "Set as primary AI", "es": "Usar como IA principal"},
  "请先添加模型配置": {"en": "Add a model configuration first", "es": "Añade primero una configuración de modelo"},
  "用于 AI 翻译、速记整理和截图解释，切换后自动保存。": {"en": "Used for AI translation, note organization and screenshot explanations. Changes are saved automatically.", "es": "Se usa para traducir, organizar notas y explicar capturas. Los cambios se guardan automáticamente."},
  "聊天联系人仍使用各自绑定的模型。": {"en": "Chat contacts keep their individual model bindings.", "es": "Los contactos conservan sus propios modelos vinculados."},
  "主 AI 已切换为「{0}」": {"en": "Primary AI set to “{0}”", "es": "IA principal cambiada a «{0}»"},
};
