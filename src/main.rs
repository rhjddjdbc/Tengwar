// Tengwar — binary entry point.
//
// All the actual wiring lives in the `tengwar` library crate (src/lib.rs).
// This file exists only to provide the executable target and the
// Windows-subsystem attribute that has to live on a binary.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tengwar::run();
}