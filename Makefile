.DEFAULT_GOAL := start

start:
	docker compose up --detach --remove-orphans

stop:
	docker compose stop

clean:
	docker system prune --all --volumes

pull:
	docker compose pull

down:
	docker compose down --remove-orphans
logs:
	docker compose logs --follow

# build with "plain" log for debug
build:
	docker compose build --no-cache --progress plain

restart: down start
update: pull down start
upgrade: down clean start
