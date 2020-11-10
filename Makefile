COVERAGE_DIR := ./code_coverage
PACKAGE_DIR := scripts
UNIT_TEST_DIR := test

unit_test:
	echo "Running unit tests";
	pytest ${UNIT_TEST_DIR} --cov=${PACKAGE_DIR} --full-trace -vv;
coverage:
	echo "Generating code coverage documentation";
	coverage html;
code_docs:
	echo "Generating code documentation (via doxygen)";
	doxygen doxygen.conf;
lint:
	echo "Running linter (any error will result in non-zero exit code)";
	pylint -j 0 ${PACKAGE_DIR}/;
clean:
	echo "Removing existing unit test and document artifacts"
	rm -r $(COVERAGE_DIR)
	rm -r docs/html/*
.PHONY: clean