// UI messages. Chinese source strings are stable keys; interpolation uses {0}, {1}, …
export const translations: Record<string, { en: string; es: string }> = {
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
};
