#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if my_assistant_lib::run_stdio_bridge() {
        return;
    }
    my_assistant_lib::run();
}
