fn main() -> Result<(), String> {
    ignore_compose_common::contract::Contract::from_current()?.write()
}
