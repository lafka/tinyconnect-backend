# tinyconnect-backend

Tinyconnect backend is the background worker for tinyconnect.
It takes care of the native side of serialport communication, and is made in
such a way to be easily replaceable depending on runtime and platform requirements.

It is intended to be spawned as a child process of the tinyconnect-gui and then
using nodes `ChildProcess` semantics for communicating between the gui and
backend. Allthough this is the only way to currently work with this, this is to
be considered legacy and one should assume that in the future the communication
transport may run over any message based protocol (like erlang-distribution, 
zmq or similar). All events will be the same


## Terminology

 * `client`     - a structure that represents a serialport
 * `clients`    - a list of clients
 * `port`       - the actual serialport of client
 * `remote`     - the remote endpoint of the client
 * `settings`   - application OR client specific settings
 * `upstream`   - the upstream connection to a remote (tcp)
 * `downstream` - the downstream connection to the serial port





## Entities and their events

Brief overview of the different emitters and what they consume


### Main process

#### Consumes

	(sync)  `clients` :: Clients       -> return current client list
	(sync)  `clients.scan` :: Clients -> force a scan for new clients
	(async) `client.connect    -> ClientRef What` -> connect the client
	(async) `client.disconnect -> ClientRef What` -> connect the client
	(async) `client.write      -> ClientRef Buf Channel` -> connect the client
	(sync)  `client.command    -> ClientRef Command [Arg] :: Ok|Error` -> call a command on the serialport
	(sync)  `client.mode -> "sync" | "pipe" :: undefined|Error` -> enable a serial mode

#### Emits

	Nothing






### Client

#### Emits

	`clients Clients` - sent on changes in clients

	`client.data:{ClientRef} Buf Channel` - sent on data reception

	`client.netup:{ClientRef}` - sent on network connection
	`client.netdown:{ClientRef} Reason` - sent on network disconnect
	`client.ttyup:{ClientRef}` - send on tty connection
	`client.ttydown:{ClientRef} Reason` - sent on tty disconnect

	`client.state:{ClientRef}` - sent on change in client state
