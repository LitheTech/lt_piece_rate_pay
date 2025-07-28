from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

# get version from __version__ variable in lt_piece_rate_pay/__init__.py
from lt_piece_rate_pay import __version__ as version

setup(
	name="lt_piece_rate_pay",
	version=version,
	description="To pay contract workers based on the number of unit they produce.",
	author="Lithe-Tech LTD",
	author_email="lithetechltd@gmail.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
